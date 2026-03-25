const scene = document.getElementById("scene")

const TOTAL = 24

for(let i=0;i<TOTAL;i++){

  const cube = document.createElement("div")
  cube.className = "cube"

  cube.style.left = Math.random()*90 + "vw"
  cube.style.top = Math.random()*90 + "vh"

  scene.appendChild(cube)
}

const video = document.getElementById("video")
const canvas = document.getElementById("overlay")
const ctx = canvas.getContext("2d")

let lastInput = "gaze"

// ---------- MOUSE CONTROL ----------
document.addEventListener("mousemove",(e)=>{
  lastInput = "mouse"
  highlightCube(e.clientX, window.innerWidth)
})


// ---------- MODELS ----------
const MODEL_URL =
"https://justadudewhohacks.github.io/face-api.js/models"

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
  faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
]).then(startVideo)


// ---------- CAMERA ----------
async function startVideo(){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video:{ width:640, height:480, facingMode:"user" }
    })

    video.srcObject = stream
    await video.play()

  }catch(err){
    alert("Camera error: "+err)
  }
}


// ---------- WHEN READY ----------
video.addEventListener("loadedmetadata",()=>{

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  trackFace()
})


// ---------- TRACK FACE ----------
async function trackFace(){

  setInterval(async()=>{

    const detection = await faceapi
      .detectSingleFace(video,new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks(true)

    ctx.clearRect(0,0,canvas.width,canvas.height)

    if(!detection) return

    const leftEye = detection.landmarks.getLeftEye()
    const rightEye = detection.landmarks.getRightEye()

    const avgLeftX = leftEye.reduce((a,p)=>a+p.x,0)/leftEye.length
    const avgRightX = rightEye.reduce((a,p)=>a+p.x,0)/rightEye.length

    const gazeX = (avgLeftX + avgRightX)/2

    // draw tracking dot
    ctx.fillStyle="#00ffff"
    ctx.beginPath()
    ctx.arc(gazeX,leftEye[0].y,6,0,Math.PI*2)
    ctx.fill()

    // ONLY use gaze if mouse isn't moving
    if(lastInput === "gaze"){
      highlightCube(gazeX,canvas.width)
    }

    setTimeout(()=> lastInput="gaze",120)

  },100)
}


// ---------- CUBE HIGHLIGHT ----------
function highlightCube(x,width){

  const cubes = document.querySelectorAll(".cube")

  cubes.forEach(cube=>{

    const rect = cube.getBoundingClientRect()
    const cubeCenter = rect.left + rect.width/2

    const dist = Math.abs(x - cubeCenter)

    cube.classList.remove("active","mid","far")

    if(dist < 120){
      cube.classList.add("active")
    }
    else if(dist < 280){
      cube.classList.add("mid")
    }
    else{
      cube.classList.add("far")
    }

  })
}