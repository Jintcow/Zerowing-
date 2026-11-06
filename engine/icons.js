// Иконки интерфейса v253: линейные, 24×24, толщина 2. Цвет — currentColor.
G.define("icons", function () {
  const P = {
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1"/>',
    gate: '<path d="M5 21V8a7 7 0 0 1 14 0v13"/><path d="M3 21h18"/><path d="M9 21V10a3 3 0 0 1 6 0v11"/>',
    dumbbell: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="1"/><path d="M9 7V4h6v3M3 12h18"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    book: '<path d="M2 5c3-1.5 7-1.5 10 1 3-2.5 7-2.5 10-1v14c-3-1.5-7-1.5-10 1-3-2.5-7-2.5-10-1z"/><path d="M12 6v14"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    sword: '<path d="M14.5 3.5H20.5V9.5L9 21 3 15z"/><path d="M5 13l6 6M3 21l3-3"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
    cards: '<rect x="3" y="6" width="11" height="15" rx="1" transform="rotate(-8 8.5 13.5)"/><rect x="10" y="3" width="11" height="15" rx="1" transform="rotate(8 15.5 10.5)"/>',
    potion: '<path d="M9 3h6M10 3v5L5 17a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3"/><path d="M7 14h10"/>',
    run: '<circle cx="15" cy="4.5" r="2"/><path d="M9 21l3-6 3 2v5M6 11l3-3h5l2 4 3 1M12 8l-2 6-4 1"/>',
    arm: '<path d="M4 18c2-6 4-9 7-12l2 1-1 4c3-1 6 0 7 3 1 4-3 6-7 6H6z"/><path d="M11 6l-1-3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    spark: '<path d="M12 2c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z"/>',
    heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
    arrow: '<path d="M7 17L17 7M8 7h9v9"/>',
    right: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    save: '<path d="M4 4h13l3 3v13H4z"/><path d="M8 4v5h8V4M8 20v-6h8v6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    rain: '<path d="M7 15a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.4 1.5A3.8 3.8 0 0 1 17 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M7 9h7M7 12h7M7 15h4"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>',
    coins: '<ellipse cx="9" cy="6" rx="6" ry="2.5"/><path d="M3 6v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6"/><ellipse cx="15" cy="14" rx="6" ry="2.5"/><path d="M9 14.5v3.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    back: '<path d="M20 12H4M10 6l-6 6 6 6"/>',
    bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    skull: '<path d="M12 3a8 8 0 0 0-5 14.2V21h10v-3.8A8 8 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/>',
    pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    list: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7.5 12.5l3 3 6-7"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H3.5c0 3 1.5 5 4 5M17 6h3.5c0 3-1.5 5-4 5M12 14v4M8 21h8M9.5 18h5"/>',
  };
  function svg(name) {
    const p = P[name] || P.info;
    return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + p + "</svg>";
  }
  return { svg, has: (n) => !!P[n], names: Object.keys(P) };
});
