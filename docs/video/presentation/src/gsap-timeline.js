// GSAP 60 FPS Master Spatial 3D Timeline Builder (Cinematic Continuous Camera Motion)
(function () {
  window.__timelines = window.__timelines || {};

  function initTimelines() {
    const masterTl = gsap.timeline({ paused: true });

    // Set initial visibility and opacity on all slide containers
    gsap.set('.slide-container', { opacity: 0, visibility: 'hidden' });

    // Ambient Glow Slow Pulsation
    masterTl.to('#glow-main', {
      scale: 1.25,
      opacity: 0.85,
      duration: 22.5,
      yoyo: true,
      repeat: 1,
      ease: 'sine.inOut'
    }, 0);

    // ==============================================================
    // SECTION 5.5: IMPACT & ROI (0.0s - 30.0s)
    // ==============================================================

    // --- SHOT 5.5A: WHO-WHAT STATEMENT (0:00 - 0:07) ---
    masterTl.set('#slide-5-5a', { visibility: 'visible' }, 0.0);
    masterTl.to('#slide-5-5a', { opacity: 1, duration: 0.7, ease: 'power2.out' }, 0.0);
    
    // CONTINUOUS 3D CAMERA DRIFT (Entire shot duration 0s -> 7s)
    masterTl.fromTo('#camera-world',
      { scale: 0.96, rotateX: 4, z: -60 },
      { scale: 1.03, rotateX: -1, z: 20, duration: 7.0, ease: 'power1.out' },
      0.0
    );

    // Synchronized Spatial Text Reveals
    masterTl.fromTo('#s5a-tag',
      { opacity: 0, y: -15, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1.0, duration: 0.5, ease: 'power3.out' },
      0.2
    );
    masterTl.fromTo('#s5a-line1',
      { opacity: 0, y: 20, z: -30 },
      { opacity: 1, y: 0, z: 0, duration: 0.6, ease: 'power3.out' },
      0.35
    );
    masterTl.fromTo('#s5a-line2',
      { opacity: 0, y: 20, z: -30 },
      { opacity: 1, y: 0, z: 0, duration: 0.6, ease: 'power3.out' },
      0.55
    );
    masterTl.fromTo('#s5a-line3',
      { opacity: 0, y: 20, z: -30 },
      { opacity: 1, y: 0, z: 0, duration: 0.6, ease: 'power3.out' },
      0.75
    );

    // Fluid Cross-Fade Transition 5.5A -> 5.5B (6.4s - 7.1s)
    masterTl.to('#slide-5-5a', { opacity: 0, y: -20, scale: 0.97, duration: 0.7, ease: 'power2.inOut' }, 6.4);
    masterTl.set('#slide-5-5a', { visibility: 'hidden' }, 7.1);

    // --- SHOT 5.5B: Big Numbers & ROI Punch (0:07 - 0:15) ---
    masterTl.set('#slide-5-5b', { visibility: 'visible' }, 6.5);
    masterTl.to('#slide-5-5b', { opacity: 1, duration: 0.7, ease: 'power2.out' }, 6.5);

    // CONTINUOUS 3D CAMERA DRIFT (Entire shot duration 6.5s -> 15s)
    masterTl.fromTo('#camera-world',
      { scale: 0.97, rotateY: 3, z: -40 },
      { scale: 1.03, rotateY: -1, z: 20, duration: 8.5, ease: 'power1.out' },
      6.5
    );

    // Harmonized Unified Depth Card Entrances (No harsh opposing lateral snaps)
    masterTl.fromTo('#s5b-card1',
      { opacity: 0, y: 30, scale: 0.94, z: -50 },
      { opacity: 1, y: 0, scale: 1.0, z: 0, duration: 0.7, ease: 'power3.out' },
      6.8
    );

    masterTl.fromTo('#s5b-card2',
      { opacity: 0, y: 30, scale: 0.94, z: -50 },
      { opacity: 1, y: 0, scale: 1.0, z: 0, duration: 0.7, ease: 'power3.out' },
      7.0
    );

    // Smooth Counter Ticker (0 to 3.4x ROI)
    const roiCounter = { val: 0 };
    masterTl.to(roiCounter, {
      val: 3.4,
      duration: 1.5,
      ease: 'power2.out',
      onUpdate: function () {
        const valElem = document.getElementById('s5b-roi-num');
        if (valElem) {
          valElem.innerText = `${roiCounter.val.toFixed(1)}× ROI`;
        }
      }
    }, 7.2);

    masterTl.fromTo('#s5b-quote',
      { opacity: 0, y: 20, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1.0, duration: 0.6, ease: 'power3.out' },
      7.7
    );

    // Fluid Cross-Fade Transition 5.5B -> 5.5C (14.4s - 15.1s)
    masterTl.to('#slide-5-5b', { opacity: 0, scale: 0.96, z: -60, duration: 0.7, ease: 'power2.inOut' }, 14.4);
    masterTl.set('#slide-5-5b', { visibility: 'hidden' }, 15.1);

    // --- SHOT 5.5C: Revenue Model & Scale Note (0:15 - 0:23) ---
    masterTl.set('#slide-5-5c', { visibility: 'visible' }, 14.5);
    masterTl.to('#slide-5-5c', { opacity: 1, duration: 0.7, ease: 'power2.out' }, 14.5);

    // CONTINUOUS 3D CAMERA DRIFT (14.5s -> 23s)
    masterTl.fromTo('#camera-world',
      { scale: 0.97, rotateX: -3, z: -40 },
      { scale: 1.03, rotateX: 2, z: 20, duration: 8.5, ease: 'power1.out' },
      14.5
    );

    masterTl.fromTo('#s5c-card-b2g',
      { opacity: 0, y: 30, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1.0, duration: 0.65, ease: 'power3.out' },
      14.8
    );

    masterTl.fromTo('#s5c-card-b2b',
      { opacity: 0, y: 30, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1.0, duration: 0.65, ease: 'power3.out' },
      15.0
    );

    masterTl.fromTo('#s5c-banner',
      { opacity: 0, y: 20, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1.0, duration: 0.6, ease: 'power3.out' },
      15.5
    );

    // Fluid Cross-Fade Transition 5.5C -> 5.5D (22.4s - 23.1s)
    masterTl.to('#slide-5-5c', { opacity: 0, y: -20, scale: 0.96, duration: 0.7, ease: 'power2.inOut' }, 22.4);
    masterTl.set('#slide-5-5c', { visibility: 'hidden' }, 23.1);

    // --- SHOT 5.5D: Adoption Roadmap & GDP Target (0:23 - 0:30) ---
    masterTl.set('#slide-5-5d', { visibility: 'visible' }, 22.5);
    masterTl.to('#slide-5-5d', { opacity: 1, duration: 0.7, ease: 'power2.out' }, 22.5);

    // CONTINUOUS 3D CAMERA DRIFT (22.5s -> 30s)
    masterTl.fromTo('#camera-world',
      { scale: 0.97, rotateY: -3, z: -40 },
      { scale: 1.03, rotateY: 2, z: 20, duration: 7.5, ease: 'power1.out' },
      22.5
    );

    masterTl.fromTo('#s5d-pilot-card',
      { opacity: 0, y: 30, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1.0, duration: 0.65, ease: 'power3.out' },
      22.8
    );

    masterTl.fromTo('#s5d-gdp-card',
      { opacity: 0, y: 30, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1.0, duration: 0.65, ease: 'power3.out' },
      23.0
    );

    // Fluid Cross-Fade Transition 5.5D -> 6A (29.4s - 30.1s)
    masterTl.to('#slide-5-5d', { opacity: 0, scale: 0.96, z: -60, duration: 0.7, ease: 'power2.inOut' }, 29.4);
    masterTl.set('#slide-5-5d', { visibility: 'hidden' }, 30.1);

    // ==============================================================
    // SECTION 6: TEAM READINESS & CAPABILITY (30.0s - 45.0s)
    // ==============================================================

    // --- SHOT 6A: Team Grid Reveal & Readiness (30:00 - 38:00) ---
    masterTl.set('#slide-6a', { visibility: 'visible' }, 29.5);
    masterTl.to('#slide-6a', { opacity: 1, duration: 0.7, ease: 'power2.out' }, 29.5);

    // CONTINUOUS 3D CAMERA DRIFT (29.5s -> 38s)
    masterTl.fromTo('#camera-world',
      { scale: 0.96, rotateX: 3, z: -40 },
      { scale: 1.03, rotateX: -2, z: 20, duration: 8.5, ease: 'power1.out' },
      29.5
    );

    masterTl.fromTo('#s6a-header',
      { opacity: 0, y: -15, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1.0, duration: 0.5, ease: 'power3.out' },
      29.8
    );

    // Kinetic Stagger Card Tilts
    masterTl.fromTo('.team-card-1',
      { opacity: 0, y: 40, scale: 0.92, z: -30 },
      { opacity: 1, y: 0, scale: 1.0, z: 0, duration: 0.6, ease: 'power3.out' },
      30.0
    );
    masterTl.fromTo('.team-card-2',
      { opacity: 0, y: 40, scale: 0.92, z: -30 },
      { opacity: 1, y: 0, scale: 1.0, z: 0, duration: 0.6, ease: 'power3.out' },
      30.2
    );
    masterTl.fromTo('.team-card-3',
      { opacity: 0, y: 40, scale: 0.92, z: -30 },
      { opacity: 1, y: 0, scale: 1.0, z: 0, duration: 0.6, ease: 'power3.out' },
      30.4
    );
    masterTl.fromTo('.team-card-4',
      { opacity: 0, y: 40, scale: 0.92, z: -30 },
      { opacity: 1, y: 0, scale: 1.0, z: 0, duration: 0.6, ease: 'power3.out' },
      30.6
    );

    masterTl.fromTo('#s6a-footer',
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' },
      31.1
    );

    // Fluid Cross-Fade Transition 6A -> 6B (37.4s - 38.1s)
    masterTl.to('#slide-6a', { opacity: 0, y: -20, scale: 0.96, duration: 0.7, ease: 'power2.inOut' }, 37.4);
    masterTl.set('#slide-6a', { visibility: 'hidden' }, 38.1);

    // --- SHOT 6B: Closing Brand Card (38:00 - 45:00) ---
    masterTl.set('#slide-6b', { visibility: 'visible' }, 37.5);
    masterTl.to('#slide-6b', { opacity: 1, duration: 0.7, ease: 'power2.out' }, 37.5);
    
    // Continuous Smooth Zoom In to Closing Brand Logo (37.5s -> 45s)
    masterTl.fromTo('#camera-world',
      { scale: 0.96 },
      { scale: 1.04, duration: 7.5, ease: 'power1.out' },
      37.5
    );

    masterTl.fromTo('#s6b-logo',
      { opacity: 0, scale: 0.85, z: -60 },
      { opacity: 1, scale: 1.0, z: 0, duration: 0.75, ease: 'power3.out' },
      37.8
    );
    masterTl.fromTo('#s6b-tagline',
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' },
      38.3
    );
    masterTl.fromTo('#s6b-event',
      { opacity: 0 },
      { opacity: 1, duration: 0.5, ease: 'power2.out' },
      38.7
    );

    // Store master timeline for HyperFrames
    window.__timelines['main'] = masterTl;

    // Sub-timelines
    const impactTl = gsap.timeline({ paused: true });
    impactTl.add(masterTl.tweenFromTo(0, 30));
    window.__timelines['impact-roi'] = impactTl;

    const teamTl = gsap.timeline({ paused: true });
    teamTl.add(masterTl.tweenFromTo(30, 45));
    window.__timelines['team-cta'] = teamTl;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTimelines);
  } else {
    initTimelines();
  }
})();
