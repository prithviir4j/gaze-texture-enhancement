"""
train.py — Phase 3: Simplified DB-LSTM Training Script
Samsung PRISM — Real-Time Predictive Texture Streaming

This script:
  1. Loads gaze log JSON exported from the Phase 1 browser demo
  2. Builds sliding-window supervised sequences
  3. Trains a dual-branch LSTM (Conv1D + Self-Attention + DBMM gate)
  4. Evaluates against a Kalman baseline on the held-out test split
  5. Exports the trained model to TensorFlow.js SavedModel format

Usage:
    python train.py --log gaze_log.json --out ./tfjs_model

Requirements:
    pip install torch tensorflowjs scikit-learn numpy matplotlib
"""

import argparse
import json
import math
import os
import subprocess
import numpy as np
import matplotlib
matplotlib.use("Agg")          # headless — no display required
import matplotlib.pyplot as plt

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.model_selection import train_test_split


# ─────────────────────────────────────────────────────────────
# 1.  HYPER-PARAMETERS
# ─────────────────────────────────────────────────────────────
SEQ_LEN     = 10          # number of input ticks (10 ticks × 100 ms = 1 s look-back)
LOOKAHEAD   = 2           # predict t+2 (200 ms ahead)
INPUT_DIM   = 4           # features per tick: [x, y, vx, vy]
HIDDEN_DIM  = 32          # LSTM hidden size
CONV_FILTERS = 16         # Conv1D output channels
ATT_HEADS   = 2           # self-attention heads
DROPOUT     = 0.2
BATCH_SIZE  = 64
EPOCHS      = 80
LR          = 3e-4
WEIGHT_DECAY = 1e-5


# ─────────────────────────────────────────────────────────────
# 2.  DATA LOADING & PREPROCESSING
# ─────────────────────────────────────────────────────────────

def load_gaze_log(path: str) -> np.ndarray:
    """
    Load the JSON gaze log exported by gaze.js (Phase 1).

    Expected JSON structure:
        {
          "meta": { "canvasW": 800, "canvasH": 600, ... },
          "frames": [ { "t": 0, "x": 0.45, "y": 0.52, "vx": 0.01, "vy": -0.005 }, ... ]
        }

    Returns:
        np.ndarray of shape (N, 4)  — columns: [x, y, vx, vy]
        All values are already normalised to [0, 1] by gaze.js.
    """
    with open(path, "r") as f:
        data = json.load(f)

    frames = data["frames"]
    arr = np.array([[fr["x"], fr["y"], fr["vx"], fr["vy"]] for fr in frames],
                   dtype=np.float32)
    print(f"[data] Loaded {len(arr)} gaze frames from '{path}'")
    return arr


def build_sequences(arr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Sliding-window dataset construction.

        X[i] = arr[i : i+SEQ_LEN]            shape (SEQ_LEN, 4)
        y[i] = arr[i+SEQ_LEN+LOOKAHEAD-1, :2]  shape (2,)  — (x, y) target

    Returns:
        X : (N_samples, SEQ_LEN, INPUT_DIM)
        y : (N_samples, 2)
    """
    X, y = [], []
    end = len(arr) - SEQ_LEN - LOOKAHEAD + 1
    for i in range(end):
        X.append(arr[i : i + SEQ_LEN])
        y.append(arr[i + SEQ_LEN + LOOKAHEAD - 1, :2])
    X = np.array(X, dtype=np.float32)
    y = np.array(y, dtype=np.float32)
    print(f"[data] Built {len(X)} supervised samples  (X={X.shape}, y={y.shape})")
    return X, y


class GazeDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.from_numpy(X)
        self.y = torch.from_numpy(y)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


# ─────────────────────────────────────────────────────────────
# 3.  MODEL DEFINITION — Simplified DB-LSTM
# ─────────────────────────────────────────────────────────────

class ConvBranch(nn.Module):
    """
    Local motion branch.
    Applies Conv1D over the time axis to capture short-range velocity
    patterns (e.g. saccade onset, acceleration profiles).

    Input  : (B, SEQ_LEN, INPUT_DIM)   — batch-first
    Output : (B, HIDDEN_DIM)
    """
    def __init__(self):
        super().__init__()
        # Conv1D expects (B, C_in, L) — we treat INPUT_DIM as channels
        self.conv1 = nn.Conv1d(INPUT_DIM, CONV_FILTERS, kernel_size=3, padding=1)
        self.relu  = nn.ReLU()
        self.conv2 = nn.Conv1d(CONV_FILTERS, CONV_FILTERS, kernel_size=3, padding=1)
        self.pool  = nn.AdaptiveAvgPool1d(1)   # global average → (B, CONV_FILTERS, 1)
        self.proj  = nn.Linear(CONV_FILTERS, HIDDEN_DIM)

    def forward(self, x):
        # x: (B, T, F) → permute → (B, F, T)
        x = x.permute(0, 2, 1)
        x = self.relu(self.conv1(x))
        x = self.relu(self.conv2(x))
        x = self.pool(x).squeeze(-1)   # (B, CONV_FILTERS)
        return self.proj(x)             # (B, HIDDEN_DIM)


class AttentionBranch(nn.Module):
    """
    Global sequence context branch.
    Scaled dot-product self-attention over the 10-tick window —
    inspired by PredRNNv3's ViT branch but adapted to 1D gaze sequences.

    Input  : (B, SEQ_LEN, INPUT_DIM)
    Output : (B, HIDDEN_DIM)
    """
    def __init__(self):
        super().__init__()
        self.input_proj = nn.Linear(INPUT_DIM, HIDDEN_DIM)
        self.attn  = nn.MultiheadAttention(embed_dim=HIDDEN_DIM,
                                           num_heads=ATT_HEADS,
                                           dropout=DROPOUT,
                                           batch_first=True)
        self.norm  = nn.LayerNorm(HIDDEN_DIM)
        self.pool  = nn.AdaptiveAvgPool1d(1)

    def forward(self, x):
        x = self.input_proj(x)                      # (B, T, HIDDEN_DIM)
        attn_out, _ = self.attn(x, x, x)            # self-attention
        x = self.norm(x + attn_out)                 # residual + LN
        # Pool over time → (B, HIDDEN_DIM)
        return x.permute(0, 2, 1).mean(dim=-1)


class DBMM(nn.Module):
    """
    Dual-Branch Modulation Module (DBMM) — fusion gate.
    Inspired by PredRNNv3 Section 3.3.

    Concatenates the two branch outputs, applies a sigmoid gate to
    learn the weighting, then linearly projects to the output space.

    Input  : conv_feat (B, HIDDEN_DIM), att_feat (B, HIDDEN_DIM)
    Output : (B, HIDDEN_DIM)
    """
    def __init__(self):
        super().__init__()
        self.gate   = nn.Sequential(
            nn.Linear(HIDDEN_DIM * 2, HIDDEN_DIM * 2),
            nn.Sigmoid()
        )
        self.proj   = nn.Linear(HIDDEN_DIM * 2, HIDDEN_DIM)
        self.dropout = nn.Dropout(DROPOUT)

    def forward(self, conv_feat, att_feat):
        combined = torch.cat([conv_feat, att_feat], dim=-1)   # (B, 2*H)
        gated    = combined * self.gate(combined)              # element-wise gate
        return self.dropout(self.proj(gated))                  # (B, H)


class DBLSTMPredictor(nn.Module):
    """
    Full DB-LSTM gaze predictor.
    ~50 K parameters — designed for < 5 ms TF.js inference.

    Architecture:
        Input (B, SEQ_LEN, 4)
            ├── ConvBranch   → (B, HIDDEN_DIM)
            └── AttBranch    → (B, HIDDEN_DIM)
                    └── DBMM fusion → (B, HIDDEN_DIM)
                            └── Output head → (B, 2)
    """
    def __init__(self):
        super().__init__()
        self.conv_branch = ConvBranch()
        self.att_branch  = AttentionBranch()
        self.dbmm        = DBMM()
        self.output_head = nn.Sequential(
            nn.Linear(HIDDEN_DIM, 16),
            nn.ReLU(),
            nn.Linear(16, 2)
        )

    def forward(self, x):
        conv_feat = self.conv_branch(x)
        att_feat  = self.att_branch(x)
        fused     = self.dbmm(conv_feat, att_feat)
        return self.output_head(fused)   # (B, 2) — predicted (x, y)


def count_params(model):
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


# ─────────────────────────────────────────────────────────────
# 4.  KALMAN FILTER BASELINE (for offline comparison)
# ─────────────────────────────────────────────────────────────

def kalman_predict_sequence(X: np.ndarray, lookahead: int = 2) -> np.ndarray:
    """
    Constant-velocity Kalman filter applied to each test sample.
    State vector: [x, y, vx, vy].

    For each input window, we:
      1. Run the filter forward over the SEQ_LEN ticks to get the final state.
      2. Extrapolate `lookahead` steps at dt=0.1 s to get the predicted position.

    Returns:
        preds : (N, 2) — predicted (x, y)
    """
    dt = 0.1   # 10 Hz → 100 ms per tick
    F  = np.array([[1, 0, dt, 0],
                   [0, 1, 0, dt],
                   [0, 0, 1,  0],
                   [0, 0, 0,  1]], dtype=np.float64)

    H  = np.eye(4, dtype=np.float64)     # observe full state
    Q  = np.eye(4, dtype=np.float64) * 1e-4
    R  = np.eye(4, dtype=np.float64) * 1e-3

    preds = []
    for window in X:
        # Initialise with first tick
        x_est = window[0].astype(np.float64).reshape(4, 1)
        P     = np.eye(4, dtype=np.float64)

        for tick in window[1:]:
            # Predict
            x_est = F @ x_est
            P     = F @ P @ F.T + Q
            # Update
            z = tick.astype(np.float64).reshape(4, 1)
            S = H @ P @ H.T + R
            K = P @ H.T @ np.linalg.inv(S)
            x_est = x_est + K @ (z - H @ x_est)
            P     = (np.eye(4) - K @ H) @ P

        # Extrapolate lookahead ticks
        for _ in range(lookahead):
            x_est = F @ x_est

        preds.append(x_est[:2, 0])

    return np.array(preds, dtype=np.float32)


# ─────────────────────────────────────────────────────────────
# 5.  TRAINING LOOP
# ─────────────────────────────────────────────────────────────

def train(args):
    # ── Load data ──────────────────────────────────────────────
    arr = load_gaze_log(args.log)
    X, y = build_sequences(arr)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, shuffle=False  # preserve temporal order
    )

    train_ds = GazeDataset(X_train, y_train)
    test_ds  = GazeDataset(X_test,  y_test)
    train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    test_dl  = DataLoader(test_ds,  batch_size=BATCH_SIZE, shuffle=False)

    # ── Build model ────────────────────────────────────────────
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model  = DBLSTMPredictor().to(device)
    print(f"[model] {count_params(model):,} trainable parameters  (device={device})")

    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)
    criterion = nn.MSELoss()

    # ── Training loop ──────────────────────────────────────────
    train_losses, val_losses = [], []

    for epoch in range(1, EPOCHS + 1):
        model.train()
        epoch_loss = 0.0
        for xb, yb in train_dl:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            pred = model(xb)
            loss = criterion(pred, yb)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            epoch_loss += loss.item() * len(xb)

        scheduler.step()
        avg_train = epoch_loss / len(train_ds)

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for xb, yb in test_dl:
                xb, yb = xb.to(device), yb.to(device)
                val_loss += criterion(model(xb), yb).item() * len(xb)
        avg_val = val_loss / len(test_ds)

        train_losses.append(avg_train)
        val_losses.append(avg_val)

        if epoch % 10 == 0:
            print(f"  Epoch {epoch:3d}/{EPOCHS}  train_MSE={avg_train:.6f}  val_MSE={avg_val:.6f}")

    # ── Evaluation ─────────────────────────────────────────────
    model.eval()
    all_preds, all_targets = [], []
    with torch.no_grad():
        for xb, yb in test_dl:
            all_preds.append(model(xb.to(device)).cpu().numpy())
            all_targets.append(yb.numpy())

    lstm_preds   = np.concatenate(all_preds)
    targets      = np.concatenate(all_targets)
    kalman_preds = kalman_predict_sequence(X_test)

    lstm_err   = np.sqrt(np.mean(np.sum((lstm_preds   - targets) ** 2, axis=1)))
    kalman_err = np.sqrt(np.mean(np.sum((kalman_preds - targets) ** 2, axis=1)))

    print(f"\n[eval] Euclidean prediction error (normalised units):")
    print(f"       Kalman filter : {kalman_err:.5f}")
    print(f"       DB-LSTM       : {lstm_err:.5f}")
    improvement = (kalman_err - lstm_err) / kalman_err * 100
    print(f"       Improvement   : {improvement:.1f}%")

    # ── Plots ──────────────────────────────────────────────────
    os.makedirs(args.out, exist_ok=True)

    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    axes[0].plot(train_losses, label="Train MSE")
    axes[0].plot(val_losses, label="Val MSE")
    axes[0].set_title("Training Curves")
    axes[0].set_xlabel("Epoch")
    axes[0].legend()
    axes[0].grid(True)

    n_plot = min(200, len(targets))
    axes[1].plot(targets[:n_plot, 0], label="True X", alpha=0.7)
    axes[1].plot(lstm_preds[:n_plot, 0],   label="DB-LSTM X", alpha=0.7)
    axes[1].plot(kalman_preds[:n_plot, 0], label="Kalman X", alpha=0.7, linestyle="--")
    axes[1].set_title("Predicted vs Actual (X axis)")
    axes[1].set_xlabel("Sample")
    axes[1].legend()
    axes[1].grid(True)

    plt.tight_layout()
    plot_path = os.path.join(args.out, "training_results.png")
    plt.savefig(plot_path, dpi=120)
    print(f"[plot] Saved training results → {plot_path}")
    plt.close()

    # ── Save PyTorch checkpoint ────────────────────────────────
    ckpt_path = os.path.join(args.out, "dblstm_gaze.pt")
    torch.save(model.state_dict(), ckpt_path)
    print(f"[save] PyTorch checkpoint → {ckpt_path}")

    # ── Export to TensorFlow.js ────────────────────────────────
    export_tfjs(model, X_test, args.out, device)


# ─────────────────────────────────────────────────────────────
# 6.  TF.JS EXPORT  (PyTorch → ONNX → TF → TF.js)
# ─────────────────────────────────────────────────────────────

def export_tfjs(model, X_sample, out_dir, device):
    """
    Export DB-LSTM to TensorFlow.js layers-model format.

    Pipeline:
        PyTorch model
          → torch.onnx.export()   → model.onnx
          → onnx2tf               → saved_model/
          → tensorflowjs_converter → tfjs_model/

    Requirements (install once):
        pip install onnx onnx2tf tensorflowjs
    """
    try:
        import onnx   # noqa: F401
    except ImportError:
        print("[export] onnx not installed — skipping TF.js export.  Run: pip install onnx onnx2tf tensorflowjs")
        return

    model.eval()
    dummy = torch.from_numpy(X_sample[:1]).to(device)   # (1, 10, 4)

    onnx_path = os.path.join(out_dir, "model.onnx")
    torch.onnx.export(
        model, dummy, onnx_path,
        input_names=["gaze_seq"],
        output_names=["pred_xy"],
        dynamic_axes={"gaze_seq": {0: "batch"}, "pred_xy": {0: "batch"}},
        opset_version=14,
    )
    print(f"[export] ONNX model → {onnx_path}")

    saved_model_dir = os.path.join(out_dir, "saved_model")
    tfjs_dir        = os.path.join(out_dir, "tfjs_model")

    try:
        result = subprocess.run(
            ["onnx2tf", "-i", onnx_path, "-o", saved_model_dir, "--non_verbose"],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print("[export] onnx2tf failed:", result.stderr)
            return
        print(f"[export] TF SavedModel → {saved_model_dir}")

        result2 = subprocess.run(
            ["tensorflowjs_converter",
             "--input_format=tf_saved_model",
             "--output_format=tfjs_graph_model",
             saved_model_dir, tfjs_dir],
            capture_output=True, text=True
        )
        if result2.returncode != 0:
            print("[export] tensorflowjs_converter failed:", result2.stderr)
            return

        print(f"[export] TF.js model → {tfjs_dir}/")
        print("[export] Copy this folder to your browser project and load with:")
        print("         tf.loadGraphModel('./tfjs_model/model.json')")
    except FileNotFoundError as e:
        print(f"[export] Tool not found: {e}.  Install with: pip install onnx2tf tensorflowjs")


# ─────────────────────────────────────────────────────────────
# 7.  ENTRY POINT
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 3 DB-LSTM Training Script")
    parser.add_argument("--log", required=True,
                        help="Path to gaze_log.json exported from the Phase 1 browser demo")
    parser.add_argument("--out", default="./model_output",
                        help="Output directory for checkpoints, plots, and TF.js model")
    args = parser.parse_args()

    train(args)
