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

function enhanceRegion(){

canvas.width = video.clientWidth
canvas.height = video.clientHeight
targetX = canvas.width / 2
targetY = canvas.height / 2
let now = performance.now()
fps = 1000 / (now - lastTime)
lastTime = now

ctx.drawImage(video,0,0,canvas.width,canvas.height)

const innerRadius = 30
const midRadius = 80

const x = Math.max(midRadius,Math.min(canvas.width-midRadius,gazeX))
const y = Math.max(midRadius,Math.min(canvas.height-midRadius,gazeY))

const imgData = ctx.getImageData(
x-midRadius,
y-midRadius,
midRadius*2,
midRadius*2
)

const data = imgData.data

for(let yOffset=0;yOffset<midRadius*2;yOffset++){
for(let xOffset=0;xOffset<midRadius*2;xOffset++){

const index = (yOffset*midRadius*2 + xOffset)*4

const dx = xOffset-midRadius
const dy = yOffset-midRadius

const dist = Math.sqrt(dx*dx + dy*dy)

let strength = 1

if(dist < innerRadius){
strength = 1.6
}
else if(dist < midRadius){
strength = 1.25
}

data[index] *= strength
data[index+1] *= strength
data[index+2] *= strength

}
}

ctx.putImageData(imgData,x-midRadius,y-midRadius)


// draw zones
ctx.beginPath()
ctx.arc(x,y,innerRadius,0,2*Math.PI)
ctx.strokeStyle="red"
ctx.lineWidth=2
ctx.stroke()

ctx.beginPath()
ctx.arc(x,y,midRadius,0,2*Math.PI)
ctx.strokeStyle="orange"
ctx.lineWidth=2
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
ctx.arc(targetX,targetY,4,0,2*Math.PI)
ctx.fill()

requestAnimationFrame(enhanceRegion)

}


//--------------------------------------------------
// START ENHANCEMENT WHEN VIDEO PLAYS
//--------------------------------------------------

video.onplay = ()=>{

enhanceRegion()

}