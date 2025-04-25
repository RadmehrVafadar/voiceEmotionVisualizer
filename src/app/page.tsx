// src/app/page.tsx
// Next.js page: Drag & drop or select MIDI/MP3, play via Web Audio,
// immersive 3D audio-reactive particle swarm with emotion-based color range, controlled noise near sphere, and spinning

'use client';
import React, { useEffect, useRef, useState, ChangeEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Midi } from '@tonejs/midi';

export default function HomePage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const analyserRef = useRef<AnalyserNode>();
  const freqDataRef = useRef<Uint8Array>();
  const timeDataRef = useRef<Uint8Array>();

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
    controls.maxDistance = 400;

    // Lighting
    scene.add(new THREE.HemisphereLight(0x808080, 0x101010, 1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(0, 1, 1);
    scene.add(dirLight);

    // Particle swarm setup
    const PARTICLES = 10000;
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
      size: 1.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Animation settings
    const maxAmpDisp = 50;   // global amplitude displacement
    const noiseAmp = 20;     // noise amplitude near sphere
    let frameId: number;

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
          // noise near sphere
          const noise = (Math.random() - 0.5) * noiseAmp;
          const disp = baseRadius + globalAmp * maxAmpDisp + noise;
          posAttr.setXYZ(i, dx * disp, dy * disp, dz * disp);

          // color range around centroid + time-based swirl
          const hueJitter = (Math.random() - 0.5) * 0.4;
          const hue = (centroid + hueJitter + 0.1 * Math.sin(t * 2)) % 1;
          const sat = 0.5 + globalAmp * 0.5;
          const lit = 0.3 + globalAmp * 0.4;
          tmpColor.setHSL(hue, sat, lit);
          colAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }

      // spin the whole swarm
      points.rotation.y += 0.002;

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