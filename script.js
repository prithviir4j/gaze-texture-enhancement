const video = document.getElementById("video")
const upload = document.getElementById("upload")
const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")

let gazeX = 200
let gazeY = 200

//--------------------------------------------------
// VIDEO UPLOAD
//--------------------------------------------------

upload.addEventListener("change", function () {

const file = this.files[0]

if (file) {
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
]).then(() => {

console.log("Models Loaded")

startCamera()

})


//--------------------------------------------------
// START WEBCAM
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

cam.style.position = "fixed"
cam.style.right = "10px"
cam.style.bottom = "10px"
cam.style.width = "140px"
cam.style.borderRadius = "10px"

cam.style.display = "none"
document.body.appendChild(cam)

cam.play()

trackFace(cam)

}
catch(err){

console.error("Camera error:",err)

}

}


//--------------------------------------------------
// GAZE DETECTION
//--------------------------------------------------

async function trackFace(cam){

setInterval(async ()=>{

const detection = await faceapi
.detectSingleFace(cam,new faceapi.TinyFaceDetectorOptions())
.withFaceLandmarks(true)

if(!detection) return

const leftEye = detection.landmarks.getLeftEye()
const rightEye = detection.landmarks.getRightEye()

const avgLeftX =
leftEye.reduce((sum,p)=>sum+p.x,0)/leftEye.length

const avgRightX =
rightEye.reduce((sum,p)=>sum+p.x,0)/rightEye.length


// average Y position of both eyes
const avgLeftY =
leftEye.reduce((sum,p)=>sum+p.y,0)/leftEye.length

const avgRightY =
rightEye.reduce((sum,p)=>sum+p.y,0)/rightEye.length

let targetX = canvas.width - ((avgLeftX + avgRightX)/2 * 2)
let targetY = ((avgLeftY + avgRightY)/2) * 2


// smooth movement
gazeX = gazeX * 0.8 + targetX * 0.2
gazeY = gazeY * 0.8 + targetY * 0.2

},100)

}


//--------------------------------------------------
// TEXTURE ENHANCEMENT
//--------------------------------------------------

function enhanceRegion(){

canvas.width = video.clientWidth
canvas.height = video.clientHeight

// draw full video frame
ctx.drawImage(video,0,0,canvas.width,canvas.height)


const radius = 50

const x = Math.max(radius,Math.min(canvas.width-radius,gazeX))
const y = Math.max(radius,Math.min(canvas.height-radius,gazeY))


const imgData = ctx.getImageData(
x-radius,
y-radius,
radius*2,
radius*2
)

const data = imgData.data

for(let i=0;i<data.length;i+=4){

data[i] = Math.min(255,data[i]*1.3)
data[i+1] = Math.min(255,data[i+1]*1.3)
data[i+2] = Math.min(255,data[i+2]*1.3)

}

ctx.putImageData(imgData,x-radius,y-radius)


// draw gaze circle
ctx.beginPath()
ctx.arc(x,y,radius,0,2*Math.PI)
ctx.strokeStyle="rgba(255,0,0,0.7)"
ctx.lineWidth=1.5
ctx.stroke()


requestAnimationFrame(enhanceRegion)

}


//--------------------------------------------------
// START PROCESSING
//--------------------------------------------------

video.onplay = ()=>{

enhanceRegion()

}