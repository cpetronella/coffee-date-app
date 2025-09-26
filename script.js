(() => {
  const form = document.getElementById('settings-form');
  const eventsList = document.getElementById('events-list');
  const modal = document.getElementById('details-modal');
  const detailsContent = document.getElementById('details-content');
  const closeModalBtn = document.getElementById('close-modal');

  // store events in memory
  let events = [];

  // Load defaults from localStorage on startup
  function loadDefaults() {
    try {
      const defaults = JSON.parse(localStorage.getItem('coffee-date-defaults'));
      if (defaults) {
        if (defaults.cadence) form.cadence.value = defaults.cadence;
        if (defaults.day) form.day.value = defaults.day;
        if (defaults.time) form.time.value = defaults.time;
        if (defaults.duration) form.duration.value = defaults.duration;
        if (defaults.location) form.location.value = defaults.location;
        if (defaults.occurrences) form.occurrences.value = defaults.occurrences;
      }
    } catch (e) {
      console.warn('Could not parse saved defaults', e);
    }
  }

  // Save current form values to localStorage
  function saveDefaults() {
    const defaults = {
      cadence: form.cadence.value,
      day: form.day.value,
      time: form.time.value,
      duration: form.duration.value,
      location: form.location.value,
      occurrences: form.occurrences.value
    };
    localStorage.setItem('coffee-date-defaults', JSON.stringify(defaults));
  }

  // Initialize defaults
  loadDefaults();

  // Event listeners
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveDefaults();
    generateEvents();
  });

  closeModalBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    // remove hash to avoid modal reopen on refresh
    history.replaceState(null, document.title, window.location.pathname);
  });

  window.addEventListener('hashchange', () => {
    // If hash matches event id, show details
    const hash = window.location.hash.replace('#', '');
    const found = events.find((ev) => ev.id === hash);
    if (found) {
      showDetails(found.id);
    } else {
      modal.classList.add('hidden');
    }
  });

  /**
   * Generate events based on form inputs
   */
  function generateEvents() {
    events = [];
    eventsList.innerHTML = '';
    const cadenceDays = parseInt(form.cadence.value, 10);
    const dayOfWeek = parseInt(form.day.value, 10);
    const timeValue = form.time.value;
    const duration = parseInt(form.duration.value, 10) || 60;
    const location = form.location.value.trim();
    let occurrences = parseInt(form.occurrences.value, 10) || 5;
    if (occurrences > 50) occurrences = 50;

    const now = new Date();
    // compute first date/time
    let start = getNextDate(now, dayOfWeek, timeValue, cadenceDays);

    for (let i = 0; i < occurrences; i++) {
      let eventStart = new Date(start.getTime());
      if (cadenceDays === 30) {
        // monthly recurrence
        eventStart.setMonth(eventStart.getMonth() + i);
      } else {
        eventStart.setDate(eventStart.getDate() + cadenceDays * i);
      }
      let eventEnd = new Date(eventStart.getTime() + duration * 60000);
      const id = 'event-' + eventStart.getTime();
      const ev = { id, start: eventStart, end: eventEnd, location };
      events.push(ev);
      renderEventCard(ev);
    }
    // Generate series .ics download if more than one event
    if (events.length) {
      renderSeriesDownload();
    }
  }

  /**
   * Compute the next date matching given day-of-week and time.
   * If the computed date/time is in the past relative to now, moves it forward by one period.
   */
  function getNextDate(now, targetDay, timeValue, cadenceDays) {
    // base date at midnight
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentDay = base.getDay();
    let diff = targetDay - currentDay;
    if (diff < 0) diff += 7;
    let result = new Date(base.getTime());
    result.setDate(base.getDate() + diff);
    const parts = timeValue.split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    result.setHours(hour);
    result.setMinutes(minute);
    result.setSeconds(0);
    result.setMilliseconds(0);
    // If the computed result has already passed for weekly/biweekly; for monthly we handle separately
    if (result <= now) {
      if (cadenceDays === 30) {
        result.setMonth(result.getMonth() + 1);
      } else {
        result.setDate(result.getDate() + 7);
      }
    }
    return result;
  }

  /**
   * Format date into a friendly string
   */
  function formatDate(date) {
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  /**
   * Convert Date to Google Calendar string (UTC) format: yyyymmddTHHmmssZ
   */
  function toGoogleDate(date) {
    const iso = date.toISOString().replace(/[-:]/g, '');
    return iso.split('.')[0] + 'Z';
  }

  /**
   * Build Google Calendar link for event
   */
  function buildGoogleLink(ev) {
    const startStr = toGoogleDate(ev.start);
    const endStr = toGoogleDate(ev.end);
    const details = encodeURIComponent('Coffee date at ' + (ev.location || ''));
    const location = encodeURIComponent(ev.location || '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Coffee+Date&dates=${startStr}/${endStr}&details=${details}&location=${location}`;
  }

  /**
   * Build an .ics Blob for a single event
   */
  function buildIcsBlob(ev) {
    const lines = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//CoffeeDate//EN');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + ev.id);
    lines.push('DTSTAMP:' + toIcsDate(new Date()));
    lines.push('DTSTART:' + toIcsDate(ev.start));
    lines.push('DTEND:' + toIcsDate(ev.end));
    lines.push('SUMMARY:Coffee Date');
    if (ev.location) lines.push('LOCATION:' + escapeIcsText(ev.location));
    lines.push('DESCRIPTION:Coffee date');
    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');
    return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  }

  /**
   * Build an .ics Blob for all events in series
   */
  function buildSeriesIcsBlob() {
    const lines = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//CoffeeDate//EN');
    events.forEach((ev) => {
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + ev.id);
      lines.push('DTSTAMP:' + toIcsDate(new Date()));
      lines.push('DTSTART:' + toIcsDate(ev.start));
      lines.push('DTEND:' + toIcsDate(ev.end));
      lines.push('SUMMARY:Coffee Date');
      if (ev.location) lines.push('LOCATION:' + escapeIcsText(ev.location));
      lines.push('DESCRIPTION:Coffee date');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  }

  /**
   * Convert Date to iCalendar format (local time) yyyymmddTHHmmss
   */
  function toIcsDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return (
      date.getFullYear() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      'T' +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  /**
   * Escape commas and semicolons for iCalendar
   */
  function escapeIcsText(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }

  /**
   * Build SMS link for event
   */
  function buildSmsLink(ev) {
    const url = window.location.origin + window.location.pathname + '#' + ev.id;
    const body = `Coffee date on ${formatDate(ev.start)} at ${ev.location || 'our spot'}. View details: ${url}`;
    // Some devices use sms:, others require sms:?&body=
    const encoded = encodeURIComponent(body);
    return `sms:?&body=${encoded}`;
  }

  /**
   * Render a single event card
   */
  function renderEventCard(ev) {
    const card = document.createElement('div');
    card.className = 'event-card';
    const title = document.createElement('h3');
    title.textContent = 'Coffee Date';
    card.appendChild(title);
    const dateP = document.createElement('p');
    dateP.innerHTML = `<strong>Date:</strong> ${formatDate(ev.start)}`;
    card.appendChild(dateP);
    const locationP = document.createElement('p');
    locationP.innerHTML = `<strong>Location:</strong> ${ev.location || '-'}`;
    card.appendChild(locationP);

    const actions = document.createElement('div');
    actions.className = 'event-actions';

    // View button
    const viewBtn = document.createElement('button');
    viewBtn.textContent = 'View';
    viewBtn.addEventListener('click', () => {
      showDetails(ev.id);
    });
    actions.appendChild(viewBtn);

    // Google Calendar link
    const gcal = document.createElement('a');
    gcal.textContent = 'Add to Google';
    gcal.href = buildGoogleLink(ev);
    gcal.target = '_blank';
    actions.appendChild(gcal);

    // Individual .ics download
    const icsLink = document.createElement('a');
    icsLink.textContent = 'Download .ics';
    const blob = buildIcsBlob(ev);
    const url = URL.createObjectURL(blob);
    icsLink.href = url;
    icsLink.download = 'coffee-date.ics';
    actions.appendChild(icsLink);

    // Share via Messages
    const sms = document.createElement('a');
    sms.textContent = 'Share via Messages';
    sms.href = buildSmsLink(ev);
    actions.appendChild(sms);

    card.appendChild(actions);
    eventsList.appendChild(card);
  }

  /**
   * Render the series .ics download link
   */
  function renderSeriesDownload() {
    const card = document.createElement('div');
    card.className = 'event-card';
    const info = document.createElement('p');
    info.textContent = `Generated ${events.length} events.`;
    card.appendChild(info);
    const actions = document.createElement('div');
    actions.className = 'event-actions';
    const seriesLink = document.createElement('a');
    seriesLink.textContent = 'Download .ics (series)';
    const blob = buildSeriesIcsBlob();
    const url = URL.createObjectURL(blob);
    seriesLink.href = url;
    seriesLink.download = 'coffee-dates-series.ics';
    actions.appendChild(seriesLink);
    card.appendChild(actions);
    eventsList.appendChild(card);
  }

  /**
   * Show event details in modal
   */
  function showDetails(id) {
    const ev = events.find((e) => e.id === id);
    if (!ev) return;
    detailsContent.innerHTML = '';
    const dateP = document.createElement('p');
    dateP.innerHTML = `<strong>Date:</strong> ${formatDate(ev.start)}`;
    detailsContent.appendChild(dateP);
    const durationMinutes = (ev.end - ev.start) / 60000;
    const durP = document.createElement('p');
    durP.innerHTML = `<strong>Duration:</strong> ${durationMinutes} minutes`;
    detailsContent.appendChild(durP);
    const locP = document.createElement('p');
    locP.innerHTML = `<strong>Location:</strong> ${ev.location || '-'}`;
    detailsContent.appendChild(locP);

    // Quick actions in details
    const actions = document.createElement('div');
    actions.className = 'details-actions';

    // Google link
    const gcal = document.createElement('a');
    gcal.textContent = 'Add to Google';
    gcal.href = buildGoogleLink(ev);
    gcal.target = '_blank';
    actions.appendChild(gcal);
    
    // Download .ics
    const icsLink = document.createElement('a');
    icsLink.textContent = 'Download .ics';
    const blob = buildIcsBlob(ev);
    const url = URL.createObjectURL(blob);
    icsLink.href = url;
    icsLink.download = 'coffee-date.ics';
    actions.appendChild(icsLink);

    // Share via Messages
    const sms = document.createElement('a');
    sms.textContent = 'Share via Messages';
    sms.href = buildSmsLink(ev);
    actions.appendChild(sms);

    // Copy link
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy event link';
    copyBtn.addEventListener('click', async () => {
      const link = window.location.origin + window.location.pathname + '#' + ev.id;
      try {
        await navigator.clipboard.writeText(link);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy event link'), 2000);
      } catch (e) {
        alert('Unable to copy');
      }
    });
    actions.appendChild(copyBtn);

    detailsContent.appendChild(actions);

    modal.classList.remove('hidden');
    // set hash for deep link
    history.replaceState(null, document.title, '#' + ev.id);
  }

  // Register service worker for offline use
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('sw.js')
        .catch((err) => console.warn('Service worker registration failed', err));
    });
  }
})();
