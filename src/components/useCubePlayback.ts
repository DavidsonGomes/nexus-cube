import {useEffect, useMemo, useRef, useState} from 'react';
import {applyAlgorithm, moveInfo, parseAlgorithm} from '../domain';
import type {CubeState} from '../domain';

/** UI timeline only. Sticker states and turns come from the domain. Remount for a new input. */
export function useCubePlayback(initialState: CubeState, algorithm: string, speed: number) {
  const tokens = useMemo(() => parseAlgorithm(algorithm), [algorithm]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [singleStep, setSingleStep] = useState(false);
  const [moving, setMoving] = useState(false);
  const [angle, setAngle] = useState(0);
  const progress = useRef(0);
  const frame = useRef(0);
  const active = useRef(false);
  const running = playing || singleStep;
  const state = useMemo(() => applyAlgorithm(initialState, tokens.slice(0, step).join(' ')), [initialState, tokens, step]);
  const current = step < tokens.length ? moveInfo(tokens[step]) : undefined;
  const turns = current?.quarterTurns ?? 0;
  function stopClock() { active.current = false; cancelAnimationFrame(frame.current); }
  function jump(next: number) {
    stopClock(); progress.current = 0;
    setAngle(0); setMoving(false); setPlaying(false); setSingleStep(false);
    setStep(Math.max(0, Math.min(tokens.length, next)));
  }
  function reset() { jump(0); }
  useEffect(() => stopClock, []);
  useEffect(() => {
    if (!moving || !running) return;
    active.current = true;
    let previous = performance.now();
    const tick = (now: number) => {
      if (!active.current) return;
      progress.current = Math.min(1, progress.current + (now - previous) * speed / 650);
      previous = now;
      setAngle(turns * 90 * (0.5 - Math.cos(progress.current * Math.PI) / 2));
      if (progress.current < 1) frame.current = requestAnimationFrame(tick);
      else {
        active.current = false; progress.current = 0;
        setAngle(0); setMoving(false); setSingleStep(false);
        setStep(value => value + 1);
      }
    };
    frame.current = requestAnimationFrame(tick);
    return stopClock;
  }, [moving, running, speed, turns]);
  useEffect(() => {
    if (!playing || moving) return;
    if (step >= tokens.length) { setPlaying(false); return; }
    const timeout = setTimeout(() => setMoving(true), 120 / speed);
    return () => clearTimeout(timeout);
  }, [playing, moving, step, tokens.length, speed]);
  function togglePlayback() {
    if (running) { stopClock(); setPlaying(false); setSingleStep(false); return; }
    if (!tokens.length) return;
    if (step === tokens.length) reset();
    setPlaying(true);
  }
  function next() {
    if (moving || step >= tokens.length) return;
    setPlaying(false); setSingleStep(true); setMoving(true);
  }
  return {tokens, step, state, current, moving, angle, running, reset, jump, next, togglePlayback};
}
