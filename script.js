const video = document.getElementById("video")
const upload = document.getElementById("upload")
const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")

let gazeX = 200
let gazeY = 200

//--------------------------------------------------
// METRICS VARIABLES
//--------------------------------------------------

let totalFrames = 0
let detectedFrames = 0

let prevX = gazeX
let prevY = gazeY
let totalJitter = 0

let lastTime = performance.now()
let fps = 0

let errorSum = 0
let errorCount = 0

let targetX = 0
let targetY = 0

//--------------------------------------------------
// VIDEO UPLOAD
//--------------------------------------------------

upload.addEventListener("change", function(){

const file = this.files[0]

if(file){
video.src = URL.createObjectURL(file)
video.play()
}

})


//--------------------------------------------------
// LOAD FACE API MODELS
//--------------------------------------------------

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models"

Promise.all([
faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
]).then(()=>{
console.log("Models Loaded")
startCamera()
})


//--------------------------------------------------
// START CAMERA
//--------------------------------------------------

async function startCamera(){

try{

const stream = await navigator.mediaDevices.getUserMedia({
video:true
})

const cam = document.createElement("video")

cam.srcObject = stream
cam.autoplay = true
cam.muted = true
cam.style.display = "none"

document.body.appendChild(cam)

cam.play()

trackFace(cam)

}catch(err){

console.error("Camera error:",err)

}

}


//--------------------------------------------------
// GAZE DETECTION
//--------------------------------------------------

async function trackFace(cam){

setInterval(async()=>{

totalFrames++
const detection = await faceapi
.detectSingleFace(cam,new faceapi.TinyFaceDetectorOptions())
.withFaceLandmarks(true)

if(!detection) return
detectedFrames++

const leftEye = detection.landmarks.getLeftEye()
const rightEye = detection.landmarks.getRightEye()

const avgLeftX =
leftEye.reduce((sum,p)=>sum+p.x,0)/leftEye.length

const avgRightX =
rightEye.reduce((sum,p)=>sum+p.x,0)/rightEye.length

const avgLeftY =
leftEye.reduce((sum,p)=>sum+p.y,0)/leftEye.length

const avgRightY =
rightEye.reduce((sum,p)=>sum+p.y,0)/rightEye.length

const eyeX = (avgLeftX + avgRightX) / 2
const eyeY = (avgLeftY + avgRightY) / 2

// normalize webcam coords
const normX = eyeX / cam.videoWidth
const normY = eyeY / cam.videoHeight

// map to canvas
let targetX = canvas.width * (1 - normX)
let targetY = canvas.height * normY

gazeX = gazeX*0.8 + targetX*0.2
gazeY = gazeY * 0.7 + targetY * 0.3

// JITTER
let dx = Math.abs(gazeX - prevX)
let dy = Math.abs(gazeY - prevY)

totalJitter += (dx + dy)

prevX = gazeX
prevY = gazeY
// ERROR
let error = Math.sqrt(
(gazeX - targetX)**2 + (gazeY - targetY)**2
)

errorSum += error
errorCount++

},100)

}


//--------------------------------------------------
// TEXTURE ENHANCEMENT
//--------------------------------------------------

function gazePriority(dist) {
  const foveal = 30
  const transition = 80
  if (dist <= foveal) return 1.0
  if (dist <= transition) {
    const t = (dist - foveal) / (transition - foveal)
    return 0.5 * (1 + Math.cos(Math.PI * t))
  }
  return 0.1
}

function applySharpening(data, width, height) {
  const kernel = [
     0, -1,  0,
    -1,  5, -1,
     0, -1,  0
  ]
  const copy = new Uint8ClampedArray(data)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * width + x) * 4 + c
        const val =
          copy[((y-1)*width + (x  ))*4+c] * kernel[1] +
          copy[((y  )*width + (x-1))*4+c] * kernel[3] +
          copy[((y  )*width + (x  ))*4+c] * kernel[4] +
          copy[((y  )*width + (x+1))*4+c] * kernel[5] +
          copy[((y+1)*width + (x  ))*4+c] * kernel[7]
        data[i] = Math.min(255, Math.max(0, val))
      }
    }
  }
}

function enhanceRegion() {

  canvas.width = video.clientWidth
  canvas.height = video.clientHeight
  targetX = canvas.width / 2
  targetY = canvas.height / 2
  let now = performance.now()
  fps = 1000 / (now - lastTime)
  lastTime = now

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  const outerRadius = 80

  const x = Math.max(outerRadius, Math.min(canvas.width  - outerRadius, gazeX))
  const y = Math.max(outerRadius, Math.min(canvas.height - outerRadius, gazeY))

  const size = outerRadius * 2
  const imgData = ctx.getImageData(x - outerRadius, y - outerRadius, size, size)
  const data = imgData.data

  for (let yOffset = 0; yOffset < size; yOffset++) {
    for (let xOffset = 0; xOffset < size; xOffset++) {

      const index = (yOffset * size + xOffset) * 4

      const dx = xOffset - outerRadius
      const dy = yOffset - outerRadius
      const dist = Math.sqrt(dx * dx + dy * dy)

      const priority = gazePriority(dist)

      if (priority > 0.8) {
        // HIGH tier — contrast + brightness
        // will sharpen separately below
        const contrast = 1.4
        for (let c = 0; c < 3; c++) {
          const boosted = (data[index + c] - 128) * contrast + 128
          data[index + c] = Math.min(255, Math.max(0, boosted * 1.2))
        }

      } else if (priority > 0.4) {
        // MEDIUM tier — contrast only, faded by priority
        const blend = (priority - 0.4) / 0.4
        const contrast = 1 + 0.4 * blend
        for (let c = 0; c < 3; c++) {
          data[index + c] = Math.min(255, Math.max(0,
            (data[index + c] - 128) * contrast + 128
          ))
        }

      }
      // LOW tier (priority <= 0.4) — pixel untouched

    }
  }

  // sharpening pass on foveal zone only (inner 30px)
  const fovealSize = 30 * 2
  const fovealOffset = outerRadius - 30
  const fovealData = ctx.getImageData(
    x - 30,
    y - 30,
    fovealSize,
    fovealSize
  )
  applySharpening(fovealData.data, fovealSize, fovealSize)
  ctx.putImageData(fovealData, x - 30, y - 30)

  ctx.putImageData(imgData, x - outerRadius, y - outerRadius)

  // draw zones
  ctx.beginPath()
  ctx.arc(x, y, 30, 0, 2 * Math.PI)
  ctx.strokeStyle = "red"
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, y, 80, 0, 2 * Math.PI)
  ctx.strokeStyle = "orange"
  ctx.lineWidth = 2
  ctx.stroke()

  //---------------- DISPLAY METRICS ----------------

  ctx.fillStyle = "white"
  ctx.font = "14px Arial"

  let detectionRate = (detectedFrames / totalFrames * 100).toFixed(1)
  let avgJitter = (totalJitter / totalFrames).toFixed(2)
  let avgError = (errorSum / errorCount).toFixed(2)

  ctx.fillText("FPS: " + fps.toFixed(1), 10, 20)
  ctx.fillText("Detection: " + detectionRate + "%", 10, 40)
  ctx.fillText("Jitter: " + avgJitter, 10, 60)
  ctx.fillText("Error: " + avgError + " px", 10, 80)

  // draw reference center point
  ctx.fillStyle = "green"
  ctx.beginPath()
  ctx.arc(targetX, targetY, 4, 0, 2 * Math.PI)
  ctx.fill()

  requestAnimationFrame(enhanceRegion)

}


//--------------------------------------------------
// START ENHANCEMENT WHEN VIDEO PLAYS
//--------------------------------------------------

video.onplay = ()=>{

enhanceRegion()

}