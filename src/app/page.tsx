// src/app/page.tsx
// Next.js page: Drag & drop or select MIDI/MP3, play via Web Audio,
// immersive 3D audio-reactive particle swarm with emotion-based color range, controlled noise near sphere, and spinning

'use client';
import React, { useEffect, useRef, useState, ChangeEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Midi } from '@tonejs/midi';

export default function HomePage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const [isMouseDown, setIsMouseDown] = useState(false);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);
  const timeDataRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    // Three.js scene
    const width = mountRef.current!.clientWidth;
    const height = mountRef.current!.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
    camera.position.set(0, 0, 200);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mountRef.current!.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 50;
    controls.maxDistance = 500;
    controls.enablePan = false; // Disable panning so rotation stays around the object
    controls.target.set(0, 0, 0); // Ensure the controls pivot is at the scene origin (particle swarm center)
    controls.rotateSpeed = 0.5; // Slow down rotation speed
    controls.autoRotate = true; // Enable automatic camera rotation around target
    controls.autoRotateSpeed = 0.5; // Control auto-rotation speed (adjust as needed)

    // Lighting
    scene.add(new THREE.HemisphereLight(0x808080, 0x101010, 1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(0, 1, 1);
    scene.add(dirLight);

    // Particle swarm setup
    const PARTICLES = 9000;
    const baseRadius = 50;
    const directions = new Float32Array(PARTICLES * 3);
    const positions = new Float32Array(PARTICLES * 3);
    const colors = new Float32Array(PARTICLES * 3);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < PARTICLES; i++) {
      const theta = THREE.MathUtils.randFloat(0, 2 * Math.PI);
      const phi = Math.acos(THREE.MathUtils.randFloat(-1, 1));
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);
      directions.set([x, y, z], i * 3);
      positions.set([x * baseRadius, y * baseRadius, z * baseRadius], i * 3);
      // base hue from phi angle
      tmpColor.setHSL(phi / Math.PI, 0.7, 0.5);
      colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 2.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Animation settings
    const maxAmpDisp = 100;   // global amplitude displacement
    const noiseAmp = 10;     // noise amplitude near sphere
    let frameId: number;

    // Mouse interaction setup
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const mouseWorldPos = new THREE.Vector3();
    const tempVector = new THREE.Vector3();
    
    // Add a div for the cursor indicator
    const cursorDiv = document.createElement('div');
    cursorDiv.style.position = 'absolute';
    cursorDiv.style.width = '30px';
    cursorDiv.style.height = '30px';
    cursorDiv.style.borderRadius = '50%';
    cursorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
    cursorDiv.style.pointerEvents = 'none';
    cursorDiv.style.transform = 'translate(-50%, -50%)';
    cursorDiv.style.zIndex = '1000';
    cursorDiv.style.transition = 'transform 0.1s ease-out';
    mountRef.current!.appendChild(cursorDiv);

    const handleMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setMousePosition({ x, y });
      
      // Update cursor position
      cursorDiv.style.left = `${x}px`;
      cursorDiv.style.top = `${y}px`;
      
      // Calculate 3D position for particle interaction
      const mouseX = (x / rect.width) * 2 - 1;
      const mouseY = -(y / rect.height) * 2 + 1;
      const vector = new THREE.Vector3(mouseX, mouseY, 0.5);
      vector.unproject(camera);
      const dir = vector.sub(camera.position).normalize();
      const distance = 200;
      const pos = camera.position.clone().add(dir.multiplyScalar(distance));
      
      // Store 3D position for particle interaction
      mouseWorldPos.copy(pos);
    };

    // Add event listeners
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mousedown', () => {
      setIsMouseDown(true);
      cursorDiv.style.transform = 'translate(-50%, -50%) scale(1.5)';
    });
    renderer.domElement.addEventListener('mouseup', () => {
      setIsMouseDown(false);
      cursorDiv.style.transform = 'translate(-50%, -50%) scale(1)';
    });
    renderer.domElement.addEventListener('mouseleave', () => {
      setIsMouseDown(false);
      cursorDiv.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    const animate = () => {
      controls.update();
      
      const analyser = analyserRef.current;
      const freqData = freqDataRef.current;
      const timeData = timeDataRef.current;
      if (analyser && freqData && timeData) {
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);

        // global amplitude
        let sumTime = 0;
        for (let v of timeData) sumTime += Math.abs(v - 128);
        const globalAmp = (sumTime / timeData.length) / 128;

        // spectral centroid
        let sumF = 0, weighted = 0;
        for (let i = 0; i < freqData.length; i++) {
          sumF += freqData[i];
          weighted += freqData[i] * i;
        }
        const centroid = sumF > 0 ? (weighted / sumF) / (freqData.length - 1) : 0;

        // update particles
        const posAttr = geometry.attributes.position as THREE.BufferAttribute;
        const colAttr = geometry.attributes.color as THREE.BufferAttribute;
        const t = performance.now() * 0.001;
        for (let i = 0; i < PARTICLES; i++) {
          const ix = i * 3;
          const dx = directions[ix], dy = directions[ix + 1], dz = directions[ix + 2];
          const noise = (Math.random() - 0.1) * noiseAmp;
          const disp = baseRadius + globalAmp * maxAmpDisp + noise;
          
          // Calculate particle position
          let px = dx * disp;
          let py = dy * disp;
          let pz = dz * disp;
          
          // Base color calculation (audio-reactive)
          const hueJitter = (Math.random() - 0.5) * 0.4;
          const baseHue = (centroid + hueJitter + 0.1 * Math.sin(t * 2)) % 1;
          const baseSat = 0.5 + globalAmp * 0.5;
          const baseLit = 0.3 + globalAmp * 0.4;
          let finalHue = baseHue;
          let finalSat = baseSat;
          let finalLit = baseLit;
          
          // Mouse interaction using the 3D position
          const particlePos = new THREE.Vector3(px, py, pz);
          const distanceToMouse = particlePos.distanceTo(mouseWorldPos);
          const interactionRadius = 100;
          
          if (distanceToMouse < interactionRadius) {
            const strength = 1 - distanceToMouse / interactionRadius; // 0 at edge, 1 at center
            const force = Math.pow(strength, 2) * 15;
            const direction = new THREE.Vector3()
              .subVectors(isMouseDown ? mouseWorldPos : particlePos, isMouseDown ? particlePos : mouseWorldPos)
              .normalize();
            
            // Apply force with some randomness
            const randomFactor = 0.2;
            px += direction.x * force * (1 + (Math.random() - 0.5) * randomFactor);
            py += direction.y * force * (1 + (Math.random() - 0.5) * randomFactor);
            pz += direction.z * force * (1 + (Math.random() - 0.5) * randomFactor);
            
            // Blend the base hue towards a highlight hue based on strength
            const highlightHue = isMouseDown ? 0.0 /* red */ : 0.6 /* blue */;
            finalHue = THREE.MathUtils.lerp(baseHue, highlightHue, strength);
            finalSat = THREE.MathUtils.clamp(baseSat + strength * 0.3, 0, 1);
            finalLit = THREE.MathUtils.clamp(baseLit + strength * 0.2, 0, 1);
          }
          
          // Set color
          tmpColor.setHSL(finalHue, finalSat, finalLit);
          colAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
          
          posAttr.setXYZ(i, px, py, pz);
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }

      // spin the whole swarm
      // Originally the rotation was 0.001 but I turned off so it does mess with the cursor
      points.rotation.y += 0.000;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener('resize', () => {
      const w = mountRef.current!.clientWidth;
      const h = mountRef.current!.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      scene.clear();
      mountRef.current?.removeChild(cursorDiv);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mousedown', () => setIsMouseDown(true));
      renderer.domElement.removeEventListener('mouseup', () => setIsMouseDown(false));
      renderer.domElement.removeEventListener('mouseleave', () => setIsMouseDown(false));
    };
  }, []);

  // Audio loading
  useEffect(() => {
    if (!file) return;
    const ctx = new (window.AudioContext || window.AudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    const freqArr = new Uint8Array(analyser.frequencyBinCount);
    const timeArr = new Uint8Array(analyser.fftSize);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;
    freqDataRef.current = freqArr;
    timeDataRef.current = timeArr;

    const playBuffer = (buf: AudioBuffer) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(analyser);
      src.start();
    };
    const playMidi = async () => {
      const ab = await file.arrayBuffer();
      const midi = new Midi(ab);
      const start = ctx.currentTime + 0.3;
      midi.tracks.forEach(track =>
        track.notes.forEach(note => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = 440 * Math.pow(2, (note.midi - 69) / 12);
          const gain = ctx.createGain();
          osc.connect(gain).connect(analyser);
          gain.gain.setValueAtTime(0, start + note.time);
          gain.gain.linearRampToValueAtTime(1, start + note.time + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, start + note.time + note.duration);
          osc.start(start + note.time);
          osc.stop(start + note.time + note.duration + 0.1);
        })
      );
    };
    (async () => {
      await ctx.resume();
      if (/\.(mid|midi)$/i.test(file.name)) await playMidi();
      else if (/\.mp3$/i.test(file.name)) {
        const data = await file.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(data);
        playBuffer(audioBuf);
      }
    })();
    return () => { ctx.close(); };
  }, [file]);

  // File handlers
  const prevent = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => { prevent(e); const f = e.dataTransfer.files[0]; if (f && /\.(mid|midi|mp3)$/i.test(f.name)) setFile(f); };
  const handleFile = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f && /\.(mid|midi|mp3)$/i.test(f.name)) setFile(f); };

  return (
    <main style={{ margin: 0, height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <div
        onDragEnter={prevent} onDragOver={prevent} onDragLeave={prevent} onDrop={handleDrop}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1,
               padding: '1rem', textAlign: 'center', background: 'rgba(0,0,0,0.6)', color: '#fff' }}
      >
        {file
          ? <span style={{ color: '#0f0' }}>Loaded: {file.name}</span>
          : (
            <span style={{ color: '#ff0' }}>
              Drag & drop .mid/.mp3 here or <input type="file" accept=".mid,.midi,.mp3" onChange={handleFile} style={{ color: '#ff0' }}/>
            </span>
          )}
      </div>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
    </main>
  );
}