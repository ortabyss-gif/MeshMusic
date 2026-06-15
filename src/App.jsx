'use client'
import { MeshGradient } from '@paper-design/shaders-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import '@uimaxbai/am-lyrics/am-lyrics.js'
import { AmLyrics } from '@uimaxbai/am-lyrics/react'
import JSZip from 'jszip'

const INITIAL_FRAME = Math.random() * 100000

function lerpColor(hex1, hex2, t) {
  const parse = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]
  const [r1,g1,b1] = parse(hex1), [r2,g2,b2] = parse(hex2)
  const r = Math.round(r1+(r2-r1)*t), g = Math.round(g1+(g2-g1)*t), b = Math.round(b1+(b2-b1)*t)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}
function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
}
function rgbToHex([r,g,b]) {
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}
function lightenRgb([r,g,b], amount=40) {
  return [Math.min(255,r+amount), Math.min(255,g+amount), Math.min(255,b+amount)]
}
function kMeans(pixels, k, iterations=12) {
  const step = Math.max(1, Math.floor(pixels.length/k))
  let centers = []
  for (let i=0; i<k; i++) centers.push([...pixels[i*step]||pixels[0]])
  for (let iter=0; iter<iterations; iter++) {
    const clusters = Array.from({length:k}, ()=>[])
    for (const px of pixels) {
      let minDist=Infinity, closest=0
      centers.forEach(([cr,cg,cb],i)=>{
        const d=(px[0]-cr)**2+(px[1]-cg)**2+(px[2]-cb)**2
        if(d<minDist){minDist=d;closest=i}
      })
      clusters[closest].push(px)
    }
    centers = clusters.map(c=>{
      if(!c.length) return [128,128,128]
      const s=c.reduce((a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]])
      return s.map(v=>Math.round(v/c.length))
    })
  }
  return centers
}
function extractColorsFromBlob(blob, count=5) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 50; canvas.height = 50
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, 50, 50)
        const {data} = ctx.getImageData(0,0,50,50)
        const pixels = []
        for (let i=0; i<data.length; i+=16) {
          const r=data[i], g=data[i+1], b=data[i+2]
          const brightness=(r+g+b)/3
          const max=Math.max(r,g,b), min=Math.min(r,g,b)
          const saturation = max===0 ? 0 : (max-min)/max
          if (brightness>25 && brightness<230 && saturation>0.08) pixels.push([r,g,b])
        }
        URL.revokeObjectURL(url)
        if (pixels.length<count) return reject('not enough pixels')
        resolve(kMeans(pixels,count).map(rgbToHex))
      } catch(e) { URL.revokeObjectURL(url); reject(e) }
    }
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject('img error') }
    img.src = url
  })
}
function formatTime(ms) {
  const s=Math.floor(ms/1000), m=Math.floor(s/60), sec=s%60
  return `${m}:${sec.toString().padStart(2,'0')}`
}

const FALLBACK_COLORS = ["#202020","#5c5c5c","#ffffff","#818181","#5e5e5e"]
const TRACKS = ['bass','vocals','drums','other']

async function parseJosng(file) {
  const zip = await JSZip.loadAsync(file)
  const files = {}
  const mimeTypes = { mp3:'audio/mpeg', webp:'image/webp', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg' }
  await Promise.all(
    Object.entries(zip.files).map(async ([name, entry]) => {
      if (entry.dir) return
      const baseName = name.split('/').pop()
      const ext = baseName.split('.').pop().toLowerCase()
      if (['mp3','webp','png','jpg','jpeg'].includes(ext)) {
        const blob = await entry.async('blob')
        files[baseName] = new Blob([blob], { type: mimeTypes[ext] || '' })
      } else if (['ttml','json','lrc'].includes(ext)) {
        files[baseName] = await entry.async('string')
      }
    })
  )
  const hasTracks = TRACKS.every(t => files[`${t}.mp3`])
  if (!hasTracks) throw new Error('Faltan pistas de audio')
  return files
}

function DropScreen({ onLoad }) {
  const [dragging, setDragging] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const inputRef = useRef(null)

  const processFiles = useCallback(async (fileList) => {
    setError(''); setLoading(true)
    try {
      const josngFiles = Array.from(fileList).filter(f => f.name.endsWith('.josng'))
      if (!josngFiles.length) { setError('Selecciona al menos un archivo .josng'); setLoading(false); return }
      const playlist = []
      for (const file of josngFiles) {
        try { playlist.push(await parseJosng(file)) } catch {}
      }
      if (!playlist.length) { setError('Ningún archivo válido'); setLoading(false); return }
      onLoad(playlist)
    } catch { setError('Error al leer los archivos') }
    setLoading(false)
  }, [onLoad])

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    processFiles(e.dataTransfer.files)
  }, [processFiles])

  return (
    <div
      onDragOver={e=>{e.preventDefault();setDragging(true)}}
      onDragLeave={()=>setDragging(false)}
      onDrop={onDrop}
      onClick={()=>!loading && inputRef.current?.click()}
      style={{width:'100vw',height:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#0a0a0a',cursor:loading?'wait':'pointer',fontFamily:'sans-serif'}}
    >
      <input ref={inputRef} type="file" accept=".josng" multiple style={{display:'none'}} onChange={e=>processFiles(e.target.files)} />
      <div style={{border:`2px dashed ${dragging?'rgba(255,255,255,0.8)':'rgba(255,255,255,0.2)'}`,borderRadius:'24px',padding:'60px 80px',display:'flex',flexDirection:'column',alignItems:'center',gap:'16px',transition:'border-color 0.2s, background 0.2s',background:dragging?'rgba(255,255,255,0.05)':'transparent'}}>
        {loading ? (
          <div style={{color:'rgba(255,255,255,0.6)',fontSize:'16px'}}>Cargando...</div>
        ) : (
          <>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            <div style={{color:'rgba(255,255,255,0.8)',fontSize:'18px',fontWeight:600}}>Abre archivos .josng</div>
            <div style={{color:'rgba(255,255,255,0.35)',fontSize:'13px',textAlign:'center'}}>Arrastra uno o varios archivos, o haz clic para seleccionar</div>
          </>
        )}
      </div>
      {error && <div style={{marginTop:'20px',color:'#ff6b6b',fontSize:'13px',textAlign:'center',maxWidth:'320px'}}>{error}</div>}
    </div>
  )
}

function Player({ playlist, currentIndex, onNext, onPrev, onLoadMore }) {
  const files = playlist[currentIndex]

  const [distortion, setDistortion]     = useState(0.3)
  const [speed, setSpeed]               = useState(0.1)
  const [isPlaying, setIsPlaying]       = useState(false)
  const [currentTime, setCurrentTime]   = useState(0)
  const [duration, setDuration]         = useState(0)
  const [colors, setColors]             = useState(FALLBACK_COLORS)
  const [ttmlString, setTtmlString]     = useState('')
  const [isMobile, setIsMobile]         = useState(window.innerWidth < 768)
  const [isSeeking, setIsSeeking]       = useState(false)
  const [seekValue, setSeekValue]       = useState(0)
  const [vocalsVolume, setVocalsVolume] = useState(1)
  const [coverUrl, setCoverUrl]         = useState(null)
  const [vocalIconUrl, setVocalIconUrl] = useState('/Vocal.webp')
  const [metadata, setMetadata]         = useState({title:'Song',artist:'Artist',album:''})

  const tracksRef        = useRef({})
  const contextRef       = useRef(null)
  const lyricsRef        = useRef(null)
  const rafRef           = useRef(null)
  const shouldPlayRef    = useRef(false)
  const isPlayingRef     = useRef(false)
  const prevDistortion   = useRef(0.3)
  const prevSpeed        = useRef(0.1)
  const baseColorsRef    = useRef(null)
  const vocalsGainRef    = useRef(null)
  const blobUrlsRef      = useRef([])
  const prevClickRef     = useRef(0)
  const uploadInputRef   = useRef(null)

  // Refs para el ciclo de colores con drums
  const colorPositionRef = useRef(0)
  const drumEnergyRef    = useRef(0)

  const onNextRef = useRef(onNext)
  useEffect(() => { onNextRef.current = onNext }, [onNext])

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  useEffect(() => {
    const handler = (e) => {
      if (e.code !== 'Space') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') return
      e.preventDefault()
      setIsPlaying(p => !p)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    return () => { blobUrlsRef.current.forEach(u=>URL.revokeObjectURL(u)); blobUrlsRef.current=[] }
  }, [files])

  useEffect(() => {
    const handler = ()=>setIsMobile(window.innerWidth<768)
    window.addEventListener('resize', handler)
    return ()=>window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    setCurrentTime(0); setDuration(0); setTtmlString(''); setCoverUrl(null)
    colorPositionRef.current = 0
    drumEnergyRef.current    = 0

    if (files['metadata.json']) { try { setMetadata(JSON.parse(files['metadata.json'])) } catch {} }
    if (files['lyrics.ttml']) setTtmlString(files['lyrics.ttml'])

    const coverAnim   = files['cover.webp']
    const coverStatic = files['cover.png'] || files['cover.jpg'] || files['cover.jpeg']
    if (coverAnim) { const u=URL.createObjectURL(coverAnim); blobUrlsRef.current.push(u); setCoverUrl(u) }
    else if (coverStatic) { const u=URL.createObjectURL(coverStatic); blobUrlsRef.current.push(u); setCoverUrl(u) }
    if (files['Vocal.webp']) { const u=URL.createObjectURL(files['Vocal.webp']); blobUrlsRef.current.push(u); setVocalIconUrl(u) }

    const colorSrc = coverStatic
    if (colorSrc) {
      extractColorsFromBlob(colorSrc,5)
        .then(ex=>{baseColorsRef.current=ex;setColors(ex)})
        .catch(()=>{baseColorsRef.current=FALLBACK_COLORS})
    }
  }, [files])

  useEffect(() => {
    if (lyricsRef.current && ttmlString) {
      lyricsRef.current.ttml = ttmlString
      const shadow = lyricsRef.current.shadowRoot
      if (shadow && !shadow.querySelector('#hide-header-style')) {
        const style = document.createElement('style')
        style.id = 'hide-header-style'
        style.textContent = `
          .lyrics-header { display: none !important; }
          .source-info { display: none !important; }
          .version-info { display: none !important; }
          * { outline: none !important; }
          *:focus { outline: none !important; }
          *:focus-visible { outline: none !important; }
          .lyrics-line { -webkit-tap-highlight-color: transparent; }
        `
        shadow.appendChild(style)
      }
    }
  }, [ttmlString])

  useEffect(() => {
    const context = new AudioContext()
    contextRef.current = context
    const audios={}, analysers={}

    TRACKS.forEach(name => {
      const url = URL.createObjectURL(files[`${name}.mp3`])
      blobUrlsRef.current.push(url)
      const audio = new Audio(url)
      audio.loop = false
      audios[name] = audio
      const source   = context.createMediaElementSource(audio)
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      // FIX: drums con smoothing bajo (0.1) para que decaiga rápido y no se acumule
      analyser.smoothingTimeConstant = name==='vocals'?0.85:name==='bass'?0.45:name==='drums'?0.1:0.5
      if (name==='vocals') {
        const gain = context.createGain()
        gain.gain.value=1; vocalsGainRef.current=gain
        source.connect(gain); gain.connect(analyser)
      } else { source.connect(analyser) }
      analyser.connect(context.destination)
      analysers[name] = analyser
    })

    audios.bass.addEventListener('loadedmetadata', ()=>setDuration(audios.bass.duration*1000))
    audios.bass.addEventListener('ended', ()=>onNextRef.current())
    tracksRef.current = audios

    const dataArrays = {}
    TRACKS.forEach(name=>{ dataArrays[name]=new Uint8Array(analysers[name].frequencyBinCount) })
    let sB=0,sV=0,sD=0,sO=0

    const DRUM_THRESHOLD = 0.055
    const ADVANCE_SPEED  = 0.010
    const RETREAT_SPEED  = 0.010

    function update() {
      rafRef.current = requestAnimationFrame(update)
      setCurrentTime(audios.bass.currentTime*1000)

      analysers.bass.getByteFrequencyData(dataArrays.bass)
      let bass=0; for(let i=0;i<35;i++) bass+=dataArrays.bass[i]; bass/=35; bass=bass<10?0:bass
      analysers.vocals.getByteFrequencyData(dataArrays.vocals)
      let vocals=0; for(let i=10;i<50;i++) vocals+=dataArrays.vocals[i]; vocals/=40
      analysers.drums.getByteFrequencyData(dataArrays.drums)
      let drums=0; for(let i=0;i<30;i++) drums+=dataArrays.drums[i]; drums/=30
      analysers.other.getByteFrequencyData(dataArrays.other)
      // FIX: empieza en bin 40 para evitar frecuencias bajas donde bleeding de drums es mayor
      let other=0; for(let i=40;i<80;i++) other+=dataArrays.other[i]; other/=40

      sB+=(bass-sB)*0.35; sV+=(vocals-sV)*0.12; sD+=(drums-sD)*0.45; sO+=(other-sO)*0.2

      const iB=Math.min(sB/1100,1), iV=Math.min(sV/150,1), iD=Math.min(sD/2000,1), iO=Math.min(sO/150,1)

      // Distorsión y velocidad: solo other
      const nd = 0.2 + iO * 0.2
      if(Math.abs(nd-prevDistortion.current)>0.008){prevDistortion.current=nd;setDistortion(nd)}
      const ns = 0.08 + iO * 0.10
      if(Math.abs(ns-prevSpeed.current)>0.004){prevSpeed.current=ns;setSpeed(ns)}

      // --- Ciclo de colores impulsado por drums ---
      const base = baseColorsRef.current || FALLBACK_COLORS
      const n = base.length

      drumEnergyRef.current += (iD - drumEnergyRef.current) * 0.3

      const pos    = colorPositionRef.current
      const floorP = Math.floor(pos)

      if (drumEnergyRef.current > DRUM_THRESHOLD) {
        const maxPos = floorP + 1
        const advance = ADVANCE_SPEED * (drumEnergyRef.current / DRUM_THRESHOLD)
        colorPositionRef.current = Math.min(pos + advance, maxPos)
      } else {
        colorPositionRef.current = Math.max(pos - RETREAT_SPEED, floorP)
      }

      colorPositionRef.current = ((colorPositionRef.current % n) + n) % n

      const curPos = colorPositionRef.current
      const idxA   = Math.floor(curPos) % n
      const idxB   = (idxA + 1) % n
      const frac   = curPos - Math.floor(curPos)

      // Solo los primeros 2 slots ciclan con los drums, el resto fijo
      const newColors = base.map((hex, i) => {
        if (i === 0) return lerpColor(base[idxA % n], base[(idxA + 1) % n], frac)
        if (i === 1) return lerpColor(base[(idxA + 1) % n], base[(idxA + 2) % n], frac)
        return hex
      })

      setColors(newColors)
    }

    update()
    if (shouldPlayRef.current) context.resume().then(()=>TRACKS.forEach(n=>audios[n].play()))
    return ()=>{ cancelAnimationFrame(rafRef.current); TRACKS.forEach(n=>audios[n].pause()); context.close() }
  }, [files])

  useEffect(() => {
    shouldPlayRef.current = isPlaying
    const context=contextRef.current, tracks=tracksRef.current
    if (!context||!Object.keys(tracks).length) return
    if (isPlaying) {
      context.resume().then(()=>TRACKS.forEach(n=>tracks[n].play()))
    } else {
      TRACKS.forEach(n=>tracks[n].pause())
      setSpeed(0); setDistortion(0.3)
      if (baseColorsRef.current) setColors(baseColorsRef.current)
    }
  }, [isPlaying])

  useEffect(() => { if (shouldPlayRef.current) setIsPlaying(true) }, [files])

  const handlePrev = useCallback(() => {
    const now=Date.now(), diff=now-prevClickRef.current
    prevClickRef.current=now
    if (diff<400) { onPrev() }
    else { Object.values(tracksRef.current).forEach(a=>{a.currentTime=0}); setCurrentTime(0) }
  }, [onPrev])

  const handleLineClick = useCallback((event) => {
    const t=event.detail.timestamp/1000
    Object.values(tracksRef.current).forEach(a=>{a.currentTime=t})
    Object.values(tracksRef.current).forEach(a=>a.play())
    setIsPlaying(true)
  }, [])

  const handleSeekChange = useCallback((e)=>setSeekValue(Number(e.target.value)),[])
  const handleSeekStart  = useCallback((e)=>{setSeekValue(Number(e.target.value));setIsSeeking(true)},[])
  const handleSeekEnd    = useCallback((e)=>{
    const val=Number(e.target.value)
    if (Object.keys(tracksRef.current).length&&duration) {
      const t=(val/100)*(duration/1000)
      Object.values(tracksRef.current).forEach(a=>{a.currentTime=t})
    }
    setIsSeeking(false)
  },[duration])

  const handleVocalsVolume = useCallback((e)=>{
    const val=Number(e.target.value); setVocalsVolume(val)
    if(vocalsGainRef.current) vocalsGainRef.current.gain.value=val
  },[])

  const handleLoadMore = useCallback(async (e)=>{
    const newSongs=[]
    for (const file of Array.from(e.target.files)) {
      if (!file.name.endsWith('.josng')) continue
      try { newSongs.push(await parseJosng(file)) } catch {}
    }
    if (newSongs.length) onLoadMore(newSongs)
    e.target.value=''
  },[onLoadMore])

  const progress = isSeeking ? seekValue : duration>0 ? (currentTime/duration)*100 : 0

  const sliderStyle = {
    WebkitAppearance:'none',appearance:'none',width:'100%',display:'block',
    boxSizing:'border-box',height:'4px',borderRadius:'2px',outline:'none',
    cursor:'pointer',border:'none',flexShrink:0,
    background:`linear-gradient(to right, white ${progress}%, rgba(255,255,255,0.25) ${progress}%)`,
  }
  const vocalsSliderStyle = {
    ...sliderStyle,minWidth:0,
    background:`linear-gradient(to right, white ${vocalsVolume*100}%, rgba(255,255,255,0.25) ${vocalsVolume*100}%)`,
  }

  const sideBtn = {
    border:'none',background:'transparent',
    display:'flex',alignItems:'center',justifyContent:'center',
    cursor:'pointer',color:'rgba(255,255,255,0.7)',fontSize:'16px',
    flexShrink:0,padding:'4px',
  }

return (
    <div style={{width:'100vw',height:'100vh',overflow:'hidden',position:'relative',background:'black'}}>

      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance:none;width:12px;height:12px;
          border-radius:50%;background:white;cursor:pointer;transition:transform 0.15s;
        }
        input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.4);}
        input[type=range]::-moz-range-thumb{
          width:12px;height:12px;border-radius:50%;background:white;cursor:pointer;border:none;
        }
        *{user-select:none;-webkit-user-select:none;outline:none;-webkit-tap-highlight-color:transparent;}
        *:focus{outline:none !important;}
        *:focus-visible{outline:none !important;}
        img{pointer-events:none;-webkit-user-drag:none;}
        input[type=range]{pointer-events:auto;}
      `}</style>

      {/* Fondo */}
      <div style={{position:'absolute',inset:0,zIndex:0}}>
        <MeshGradient
          width={window.innerWidth} height={window.innerHeight}
          colors={colors} distortion={distortion} swirl={0.05} speed={speed}
          frame={INITIAL_FRAME} grainMixer={0} grainOverlay={0}
        />
      </div>

      {/* Contador + botón añadir */}
      <div style={{position:'absolute',top:'16px',right:'16px',zIndex:10,display:'flex',alignItems:'center',gap:'8px'}}>
        <div style={{color:'rgba(255,255,255,0.4)',fontSize:'12px',fontFamily:'sans-serif'}}>
          {currentIndex+1} / {playlist.length}
        </div>
        <input ref={uploadInputRef} type="file" accept=".josng" multiple style={{display:'none'}} onChange={handleLoadMore}/>
        <button tabIndex={-1} onClick={()=>uploadInputRef.current?.click()}
          style={{border:'none',background:'rgba(255,255,255,0.08)',backdropFilter:'blur(12px)',borderRadius:'12px',width:'40px',height:'40px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:0}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      </div>

      {/* Layout */}
      <div style={{position:'absolute',inset:0,zIndex:1,display:'flex',flexDirection:isMobile?'column':'row',alignItems:'stretch',padding:isMobile?'24px 20px 0':'0 60px',gap:isMobile?'16px':'60px'}}>

        {/* Columna izquierda */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flexShrink:0,gap:'12px'}}>

          {/* Player card */}
          <div style={{
            display:'flex',flexDirection:isMobile?'row':'column',alignItems:'center',
            gap: files['cover.webp'] ? 0 : isMobile?'16px':'20px',
            backdropFilter:'blur(20px)',
            background:'rgba(0,0,0,0.2)',
            padding: files['cover.webp'] ? 0 : isMobile?'16px':'28px',
            borderRadius:'28px',
            width:isMobile?'100%':'auto',
            boxSizing:'border-box',
            overflow: 'hidden',
          }}>

            {/* Cover webp: llega a los 3 bordes, blur transparente abajo */}
{coverUrl && files['cover.webp'] && (
  <div
    style={{
      position: 'relative',
      width: '100%',
      height: isMobile ? '180px' : '300px',
      overflow: 'hidden',
      flexShrink: 0,

      borderTopLeftRadius: '28px',
      borderTopRightRadius: '28px',
    }}
  >
    <img
      src={coverUrl}
      alt="cover"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: 'center top',
        display: 'block',

        WebkitMaskImage:
          'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)',
        maskImage:
          'linear-gradient(to bottom, black 0%, black 70%, transparent 100%)',
      }}
    />
  </div>
)}

            {/* Cover png/jpg: normal con bordes redondeados */}
            {coverUrl && !files['cover.webp'] && (
              <img src={coverUrl} alt="cover" style={{
                width:isMobile?'80px':'300px',
                height:isMobile?'80px':'300px',
                borderRadius:isMobile?'12px':'18px',
                objectFit:'cover',
                flexShrink:0,
              }}/>
            )}

            {/* Contenido: título, controles, seekbar */}
            <div style={{
              display:'flex',flexDirection:'column',gap:'12px',
              flex:isMobile?1:'unset',
              width:isMobile?'0':'300px',
              minWidth:0,
              padding: files['cover.webp'] ? (isMobile?'12px 16px 16px':'16px 28px 28px') : '0',
            }}>

              <div style={{display:'flex',flexDirection:'row',alignItems:'center',gap:'10px'}}>
                <div style={{color:'white',fontFamily:'sans-serif',textAlign:'left',minWidth:0,flex:1}}>
                  <div style={{fontSize:isMobile?'16px':'20px',fontWeight:'600',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {metadata.title}
                  </div>
                  <div style={{opacity:0.7,marginTop:'4px',fontSize:isMobile?'13px':'14px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {metadata.artist}
                  </div>
                  {metadata.album && (
                    <div style={{opacity:0.4,marginTop:'2px',fontSize:isMobile?'11px':'12px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {metadata.album}
                    </div>
                  )}
                </div>

                <div style={{display:'flex',flexDirection:'row',alignItems:'center',gap:'6px',flexShrink:0}}>
                  <button tabIndex={-1} style={sideBtn} onClick={handlePrev} title="1 click: reiniciar · 2 clicks: anterior">⏮</button>
                  <button
                    tabIndex={-1}
                    onClick={()=>setIsPlaying(p=>!p)}
                    style={{
                      border:'none',background:'white',color:'black',
                      width:isMobile?'38px':'44px',height:isMobile?'38px':'44px',
                      borderRadius:'999px',fontSize:isMobile?'13px':'16px',
                      cursor:'pointer',flexShrink:0,
                      display:'flex',alignItems:'center',justifyContent:'center',
                    }}
                  >{isPlaying?'❚❚':'▶'}</button>
                  <button tabIndex={-1} style={sideBtn} onClick={onNext} title="Siguiente canción">⏭</button>
                </div>
              </div>

              {duration>0 && (
                <div style={{display:'flex',flexDirection:'column',gap:'4px',width:'100%'}}>
                  <input type="range" min={0} max={100} step={0.1} value={progress}
                    onChange={handleSeekChange}
                    onMouseDown={handleSeekStart} onTouchStart={handleSeekStart}
                    onMouseUp={handleSeekEnd}     onTouchEnd={handleSeekEnd}
                    style={sliderStyle}
                  />
                  <div style={{display:'flex',justifyContent:'space-between',color:'rgba(255,255,255,0.5)',fontSize:'11px',fontFamily:'sans-serif',fontVariantNumeric:'tabular-nums'}}>
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Vocals card */}
          <div style={{backdropFilter:'blur(20px)',background:'rgba(0,0,0,0.2)',padding:'12px 16px',borderRadius:'16px',width:isMobile?'100%':`${300+28*2}px`,boxSizing:'border-box',display:'flex',alignItems:'center',gap:'10px'}}>
            <img src={vocalIconUrl} alt="Vocals" style={{width:'20px',height:'20px',objectFit:'contain',flexShrink:0,opacity:0.6}}/>
            <input type="range" min={0} max={1} step={0.01} value={vocalsVolume} onChange={handleVocalsVolume}
              style={{...vocalsSliderStyle,flex:1,minWidth:0}}/>
          </div>
        </div>

        {/* Lyrics */}
        <div style={{flex:1,height:isMobile?'0':'100%',minHeight:0}}>
          {ttmlString && (
            <AmLyrics ref={lyricsRef} currentTime={currentTime} onLineClick={handleLineClick} autoScroll interpolate
              style={{display:'block',width:'100%',height:'100%','--am-lyrics-highlight-color':'#ffffff',color:'rgba(255,255,255,0.35)'}}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [playlist, setPlaylist]         = useState(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  const playlistRef = useRef(playlist)
  useEffect(() => { playlistRef.current = playlist }, [playlist])

  const handleNext = useCallback(()=>{
    setCurrentIndex(i => i < playlistRef.current.length-1 ? i+1 : i)
  }, [])

  const handlePrev = useCallback(()=>{
    setCurrentIndex(i => i > 0 ? i-1 : i)
  }, [])

  const handleLoadMore = useCallback((newSongs)=>{
    setPlaylist(prev => [...prev, ...newSongs])
  }, [])

  if (!playlist) return <DropScreen onLoad={p=>{ setPlaylist(p); setCurrentIndex(0) }} />
  return <Player playlist={playlist} currentIndex={currentIndex} onNext={handleNext} onPrev={handlePrev} onLoadMore={handleLoadMore} />
}

// Execute: npm run dev -- --host
// ffmpeg -i cover.mp4 -c:v libwebp -lossless 0 -q:v 100 -preset picture -loop 0 cover.webp
// demucs --mp3 --mp3-bitrate 320 music.m4a

// py BuilderJosng.py

// npm run build && npx cap sync && npx cap open android

// Powered by Claude IA (Anthropic)
// Made by Ortax