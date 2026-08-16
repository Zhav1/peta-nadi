// GSAP 60 FPS Master Spatial 3D Timeline Builder (Cinematic Continuous Camera Motion)
(function () {
  window.__timelines = window.__timelines || {};

  function injectData() {
    const c = window.PETANADI_CONFIG;
    
    // Slide 2
    document.getElementById('s2-b2g-val').innerText = c.impact.b2gLicense;
    document.getElementById('s2-b2b-val').innerText = c.impact.b2bSaaS;
    
    // Slide 3 Revenue Values
    document.getElementById('val-y1').innerText = c.impact.arrY1;
    document.getElementById('val-y2').innerText = c.impact.arrY2;
    document.getElementById('val-y3').innerText = c.impact.arrY3;

    // Slide 4 Real-Life Transferable Impact Statement
    document.getElementById('s4-impact-text').innerText = `"${c.impact.realLifeImpact}"`;

    // Slide 5 Team Grid
    const teamGrid = document.getElementById('team-grid');
    teamGrid.innerHTML = '';
    c.team.forEach((t, i) => {
      const avatarHtml = t.photo 
        ? `<img src="${t.photo}" class="team-avatar-img" alt="${t.name}">`
        : `<span class="team-avatar-initials">${t.initials}</span>`;

      teamGrid.innerHTML += `
        <div class="team-card team-card-${i+1}">
          <div class="team-avatar-container">
            ${avatarHtml}
          </div>
          <div class="team-name">${t.name}</div>
          <div class="team-role">${t.role}</div>
          <div class="team-detail">${t.detail}</div>
        </div>
      `;
    });
    document.getElementById('s5-footer').innerText = `"${c.teamReadinessSummary}"`;
  }

  function initTimelines() {
    injectData();

    const masterTl = gsap.timeline({ paused: true });

    // Set initial visibility and opacity on all slide containers
    gsap.set('.slide-container', { opacity: 0, visibility: 'hidden' });

    // Ambient Glow Slow Pulsation
    masterTl.to('#glow-main', {
      scale: 1.3,
      opacity: 0.85,
      duration: 19.0,
      yoyo: true,
      repeat: 1,
      ease: 'sine.inOut'
    }, 0);

    // ==============================================================
    // SECTION 5: IMPACT & ROI (0.0s - 27.0s)
    // ==============================================================

    // --- SLIDE 1: Valuasi Impact & ROI (0:00 - 0:06) ---
    masterTl.set('#slide-1', { visibility: 'visible' }, 0.0);
    masterTl.to('#slide-1', { opacity: 1, duration: 0.7, ease: 'power2.out' }, 0.0);
    
    masterTl.fromTo('#camera-world',
      { scale: 0.96, rotateX: 4, z: -60 },
      { scale: 1.04, rotateX: -1, z: 20, duration: 27.0, ease: 'none' }, // Continuous drift
      0.0
    );

    masterTl.fromTo('#s1-tag', { opacity: 0, y: -15 }, { opacity: 1, y: 0, duration: 0.5 }, 0.2);
    
    masterTl.fromTo('#s1-metric1', { opacity: 0, y: 25 }, { opacity: 1, y: 0, duration: 0.5 }, 0.4);
    masterTl.fromTo('#s1-val1', { scale: 0.7, opacity: 0 }, { scale: 1.0, opacity: 1, duration: 0.8, ease: 'back.out(1.5)' }, 0.6);
    
    masterTl.fromTo('#s1-metric2', { opacity: 0, y: 25 }, { opacity: 1, y: 0, duration: 0.5 }, 0.8);
    masterTl.fromTo('#s1-val2', { scale: 0.5, opacity: 0 }, { scale: 1.0, opacity: 1, duration: 1.0, ease: 'elastic.out(1, 0.5)' }, 1.0);

    masterTl.fromTo('#s1-metric3', { opacity: 0, y: 25 }, { opacity: 1, y: 0, duration: 0.5 }, 1.2);
    masterTl.fromTo('#s1-val3', { scale: 0.7, opacity: 0 }, { scale: 1.0, opacity: 1, duration: 0.8, ease: 'back.out(1.5)' }, 1.4);

    // Cross-fade Slide 1 -> Slide 2
    masterTl.to('#slide-1', { opacity: 0, scale: 0.96, duration: 0.6 }, 5.4);
    masterTl.set('#slide-1', { visibility: 'hidden' }, 6.0);

    // --- SLIDE 2: Model Bisnis Hybrid B2G & B2B (0:06 - 0:13) ---
    masterTl.set('#slide-2', { visibility: 'visible' }, 5.5);
    masterTl.to('#slide-2', { opacity: 1, duration: 0.7 }, 5.5);

    masterTl.fromTo('#s2-tag', { opacity: 0, y: -15 }, { opacity: 1, y: 0, duration: 0.5 }, 6.0);
    masterTl.fromTo('#s2-card-b2g', { opacity: 0, y: 40, rotateX: 10 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.8, ease: 'power3.out' }, 6.2);
    masterTl.fromTo('#s2-card-b2b', { opacity: 0, y: 40, rotateX: 10 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.8, ease: 'power3.out' }, 6.4);

    // Cross-fade Slide 2 -> Slide 3
    masterTl.to('#slide-2', { opacity: 0, y: -20, duration: 0.6 }, 12.4);
    masterTl.set('#slide-2', { visibility: 'hidden' }, 13.0);

    // --- SLIDE 3: Proyeksi Pendapatan 3 Thn (0:13 - 0:20) ---
    masterTl.set('#slide-3', { visibility: 'visible' }, 12.5);
    masterTl.to('#slide-3', { opacity: 1, duration: 0.7 }, 12.5);

    masterTl.fromTo('#s3-tag', { opacity: 0, y: -15 }, { opacity: 1, y: 0, duration: 0.5 }, 13.0);
    
    const rows = document.querySelectorAll('.growth-row');
    masterTl.to(rows[0], { opacity: 1, x: 0, duration: 0.5 }, 13.2);
    masterTl.to('#bar-y1', { width: '15%', duration: 0.8, ease: 'power2.out' }, 13.4);
    masterTl.to('#val-y1', { opacity: 1, duration: 0.3 }, 13.8);

    masterTl.to(rows[1], { opacity: 1, x: 0, duration: 0.5 }, 14.0);
    masterTl.to('#bar-y2', { width: '42%', duration: 0.8, ease: 'power2.out' }, 14.2);
    masterTl.to('#val-y2', { opacity: 1, duration: 0.3 }, 14.6);

    masterTl.to(rows[2], { opacity: 1, x: 0, duration: 0.5 }, 14.8);
    masterTl.to('#bar-y3', { width: '85%', duration: 1.0, ease: 'power2.out' }, 15.0);
    masterTl.to('#val-y3', { opacity: 1, duration: 0.3 }, 15.5);

    // Cross-fade Slide 3 -> Slide 4
    masterTl.to('#slide-3', { opacity: 0, scale: 0.96, duration: 0.6 }, 19.4);
    masterTl.set('#slide-3', { visibility: 'hidden' }, 20.0);

    // --- SLIDE 4: Operational & Real-Life Impact (0:20 - 0:27) ---
    masterTl.set('#slide-4', { visibility: 'visible' }, 19.5);
    masterTl.to('#slide-4', { opacity: 1, duration: 0.7 }, 19.5);

    masterTl.fromTo('#s4-tag', { opacity: 0, y: -15 }, { opacity: 1, y: 0, duration: 0.5 }, 20.0);
    
    masterTl.fromTo('#s4-metric1', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, 20.2);
    masterTl.fromTo('#s4-val1', { scale: 0.7, opacity: 0 }, { scale: 1.0, opacity: 1, duration: 0.8, ease: 'back.out(1.5)' }, 20.4);

    masterTl.fromTo('#s4-metric2', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, 20.6);
    masterTl.fromTo('#s4-val2', { scale: 0.7, opacity: 0 }, { scale: 1.0, opacity: 1, duration: 0.8, ease: 'back.out(1.5)' }, 20.8);

    masterTl.fromTo('#s4-metric3', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, 21.0);
    masterTl.fromTo('#s4-val3', { scale: 0.7, opacity: 0 }, { scale: 1.0, opacity: 1, duration: 0.8, ease: 'back.out(1.5)' }, 21.2);

    masterTl.fromTo('#s4-impact-box',
      { opacity: 0, y: 30, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1.0, duration: 0.8, ease: 'power3.out' },
      21.8
    );
    masterTl.to('#s4-underline', { width: '100%', duration: 1.2, ease: 'power2.inOut' }, 22.4);

    // Cross-fade Slide 4 -> Slide 5
    masterTl.to('#slide-4', { opacity: 0, y: -20, duration: 0.6 }, 26.4);
    masterTl.set('#slide-4', { visibility: 'hidden' }, 27.0);

    // ==============================================================
    // SECTION 6: TEAM READINESS & BRAND CTA (27.0s - 38.0s)
    // ==============================================================

    // --- SLIDE 5: Team Readiness & Photos (0:27 - 0:33) ---
    masterTl.set('#slide-5', { visibility: 'visible' }, 26.5);
    masterTl.to('#slide-5', { opacity: 1, duration: 0.7 }, 26.5);

    masterTl.fromTo('#camera-world',
      { scale: 0.95, rotateY: -3, rotateX: 2, z: -40 },
      { scale: 1.05, rotateY: 2, rotateX: -1, z: 20, duration: 11.0, ease: 'none' }, // 27s to 38s
      27.0
    );

    masterTl.fromTo('#s5-header', { opacity: 0, y: -15 }, { opacity: 1, y: 0, duration: 0.5 }, 27.0);

    masterTl.fromTo('.team-card-1', { opacity: 0, y: 40, z: -30 }, { opacity: 1, y: 0, z: 0, duration: 0.6, ease: 'power3.out' }, 27.2);
    masterTl.fromTo('.team-card-2', { opacity: 0, y: 40, z: -30 }, { opacity: 1, y: 0, z: 0, duration: 0.6, ease: 'power3.out' }, 27.4);
    masterTl.fromTo('.team-card-3', { opacity: 0, y: 40, z: -30 }, { opacity: 1, y: 0, z: 0, duration: 0.6, ease: 'power3.out' }, 27.6);
    masterTl.fromTo('.team-card-4', { opacity: 0, y: 40, z: -30 }, { opacity: 1, y: 0, z: 0, duration: 0.6, ease: 'power3.out' }, 27.8);

    masterTl.fromTo('#s5-footer', { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.5 }, 28.5);

    // Cross-fade Slide 5 -> Slide 6
    masterTl.to('#slide-5', { opacity: 0, scale: 0.96, duration: 0.6 }, 32.4);
    masterTl.set('#slide-5', { visibility: 'hidden' }, 33.0);

    // --- SLIDE 6: Brand CTA with Logo Icon + Peta Nadi Text (33 - 38s) ---
    masterTl.set('#slide-6', { visibility: 'visible' }, 32.5);
    masterTl.fromTo('#slide-6', { opacity: 0 }, { opacity: 1, duration: 0.6 }, 32.5);

    // Animate Brand Row (Logo Icon + Peta Nadi Text together)
    masterTl.fromTo('#s6-brand-row',
      { opacity: 0, scale: 0.85, y: 35 },
      { opacity: 1, scale: 1.0, y: 0, duration: 0.9, ease: 'back.out(1.4)' },
      32.8
    );

    // Animate Tagline
    masterTl.fromTo('#s6-tagline',
      { opacity: 0, y: 25 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' },
      33.4
    );

    // Animate Event Subtitle
    masterTl.fromTo('#s6-event',
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' },
      33.9
    );

    // Store master timeline for HyperFrames
    window.__timelines['main'] = masterTl;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTimelines);
  } else {
    initTimelines();
  }
})();
