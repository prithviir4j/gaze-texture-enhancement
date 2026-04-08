# Gaze-Based Predictive Texture Streaming - Demo Guide

## Project Overview
This project demonstrates real-time gaze-driven texture enhancement for 3D scenes using webcam-based eye tracking and predictive algorithms.

## Key Features Implemented
- **Real-time gaze tracking** at 10 Hz using face-api.js
- **Multi-resolution texture streaming** (64px/256px/512px)
- **Three prediction modes**: Reactive, Kalman filter, DB-LSTM
- **Live metrics dashboard** showing performance indicators
- **Export functionality** for gaze data analysis

## Quick Start Demo

### 1. System Setup
```bash
# Start the local server
./start_server.bat
# OR manually:
python -m http.server 8000
```

### 2. Access the Demo
Open browser to: `http://localhost:8000`

### 3. Camera Permission
- Allow webcam access when prompted
- Position face in good lighting
- Ensure eyes are visible to camera

### 4. Demonstration Flow

#### Phase 1: Baseline Reactive Mode (Default)
1. **Observe**: Textures change based on current gaze position
2. **Metrics**: Watch pop-in counter and load latency
3. **Experience**: Notice texture pop-in artifacts when looking quickly

#### Phase 2: Kalman Filter Prediction
1. **Switch**: Select "Kalman (200 ms lookahead)" from dropdown
2. **Compare**: Notice reduced pop-in events
3. **Metrics**: Lower pop-in count, similar latency

#### Phase 3: DB-LSTM Neural Network
1. **Activate**: Select "DB-LSTM (Phase 3)" 
2. **Warm-up**: Wait for "ML: READY" status (5-10 seconds)
3. **Advanced**: Observe smoothest texture transitions

## Scene Demonstrations

### Gallery Scene
- 8 panels arranged in a ring
- Look at different panels to see texture enhancement
- Best for demonstrating focused gaze tracking

### Tunnel Scene  
- Corridor with side panels
- Demonstrates predictive tracking during movement
- Shows forward-motion prediction capabilities

## Key Metrics to Highlight

### Performance Indicators
- **FPS**: Frame rate stability (target: 60 FPS)
- **Sensor Hz**: Gaze tracking frequency (target: 10 Hz)
- **Face Detection**: Success percentage (aim for >90%)
- **Pop-in**: Texture pop-in events (lower is better)
- **Load Latency**: Time to load higher-resolution textures
- **GPU Memory**: Texture memory usage efficiency
- **Prediction Error**: Accuracy of gaze prediction (lower is better)

### ML Model Metrics (DB-LSTM mode)
- **ML Status**: WARMING -> READY transition
- **Buffer Fill**: 0/10 -> 10/10 when fully loaded
- **Inference Time**: <5ms per prediction (real-time capable)

## Export and Analysis Features

### Gaze Data Export
1. Click "Export Gaze Log" button
2. Downloads JSON with:
   - Timestamp, gaze coordinates, velocity
   - Metadata about tracking parameters
   - Up to 1 hour of tracking data

### Data Analysis
- Use exported logs for offline analysis
- Compare prediction accuracy across modes
- Train custom models with collected data

## Technical Architecture Highlights

### Modular Design
- **gaze.js**: Face tracking and data logging
- **kalman.js**: Physics-based prediction
- **phase_3/model.js**: Neural network inference
- **streaming.js**: Multi-resolution texture management
- **scene.js**: Three.js 3D rendering
- **metrics.js**: Real-time performance monitoring

### Browser-Only Implementation
- No native dependencies
- Runs entirely in WebGL/JavaScript
- TensorFlow.js for ML inference
- Face-api.js for eye tracking

## Troubleshooting

### Common Issues
1. **No face detected**: Improve lighting, move closer to camera
2. **Low FPS**: Close other browser tabs, ensure GPU acceleration
3. **ML not loading**: Check browser console for errors
4. **Texture pop-in**: Normal in reactive mode, reduced in predictive modes

### Browser Compatibility
- **Recommended**: Chrome/Edge with WebGL support
- **Required**: Camera permissions
- **Optional**: GPU acceleration for better performance

## Presentation Tips for Mentors

### Demo Sequence
1. **Start with reactive mode** to show baseline problem
2. **Switch to Kalman** to demonstrate improvement
3. **Activate DB-LSTM** to showcase ML capabilities
4. **Export data** to show analysis capabilities

### Key Talking Points
- **Problem**: Texture pop-in in traditional streaming
- **Solution**: Predictive preloading based on gaze patterns
- **Innovation**: Browser-only implementation with real-time ML
- **Results**: Measurable reduction in pop-in artifacts
- **Future**: Potential for XR/VR applications

### Metrics to Emphasize
- 200ms prediction lookahead
- <5ms ML inference time
- 10Hz gaze tracking frequency
- 60 FPS rendering performance
- Browser-only deployment

## Advanced Features

### Model Training Pipeline
- `phase_3/train.py`: Python training script
- Supports custom gaze sequence datasets
- Exports to TensorFlow.js format
- Configurable LSTM architecture

### Evaluation Framework
- Real-time prediction error calculation
- Pop-in event counting
- Load latency measurement
- Comparative mode analysis

## Stretch Goals Implemented
- Multi-scene support (Gallery/Tunnel)
- Real-time metrics dashboard
- Export functionality for analysis
- Modular prediction system
- Browser-only deployment

## Future Enhancements
- Head orientation fusion
- Semantic texture prioritization  
- Adaptive model selection
- Mobile device support
