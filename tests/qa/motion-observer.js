// Observador DOM somente leitura, instalado pelo Portal Sonda durante QA.
(() => {
  if (window.__qaMotionFrame) cancelAnimationFrame(window.__qaMotionFrame);
  const start = performance.now();
  let lastSample = -Infinity;
  window.__qaMotion = [];
  const tick = () => {
    const elapsed = performance.now() - start;
    if (elapsed - lastSample >= 45) {
      const cube = document.querySelector('.playback .cube-viewport');
      window.__qaMotion.push({
        elapsedMs: elapsed,
        label: cube?.getAttribute('aria-label'),
        play: document.querySelector('.play-button')?.getAttribute('aria-label'),
        current: document.querySelector('.move-tokens .current')?.getAttribute('aria-label'),
        nextDisabled: document.querySelector('[aria-label="Próximo movimento"]')?.disabled,
        polygons: [...(cube?.querySelectorAll('polygon') ?? [])].map(p => ({ fill: p.getAttribute('fill'), points: p.getAttribute('points') })),
      });
      lastSample = elapsed;
    }
    if (elapsed < 6500) window.__qaMotionFrame = requestAnimationFrame(tick);
  };
  tick();
  return 'QA observer installed, no application state changed';
})();
