/* ---------------------------------------------------------------
   SkyCast — data layer (Open-Meteo) + rendering + tiny icon system
--------------------------------------------------------------- */

const API_BASE="https://api.open-meteo.com/v1/forecast";
const GEOCODING_API="https://geocoding-api.open-meteo.com/v1/search";

let unit="C";
let latestWeather=null;
let currentPlace=null;
let lastAction=null;
let suggestItems=[];
let activeSuggest=-1;
let suggestAbort=null;

const $ = (id) => document.getElementById(id);

const els = {
  searchForm: $("searchForm"),
  cityInput: $("cityInput"),
  suggestList: $("suggestList"),
  locationBtn: $("locationBtn"),
  refreshBtn: $("refreshBtn"),
  unitToggle: $("unitToggle"),
  status: $("status"),
  skeleton: $("skeleton"),
  weatherContent: $("weatherContent"),
  welcome: $("welcome"),
  heroCard: $("heroCard"),
  skyOrb: $("skyOrb"),
  skyPrecip: $("skyPrecip"),
  cityName: $("cityName"),
  countryName: $("countryName"),
  currentDate: $("currentDate"),
  weatherIcon: $("weatherIcon"),
  temperature: $("temperature"),
  temperatureUnit: $("temperatureUnit"),
  condition: $("condition"),
  feelsLike: $("feelsLike"),
  humidity: $("humidity"),
  wind: $("wind"),
  rain: $("rain"),
  tempTrend: $("tempTrend"),
  hourlyForecast: $("hourlyForecast"),
  dailyForecast: $("dailyForecast"),
  sunrise: $("sunrise"),
  sunset: $("sunset"),
  highLow: $("highLow"),
  uvIndex: $("uvIndex"),
  pressure: $("pressure"),
  localTime: $("localTime")
};

/* ---------------------------------------------------------------
   Weather condition text + icon-group lookup
--------------------------------------------------------------- */

const weatherCodes = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail"
};

function conditionText(code) {
  return weatherCodes[code] || "Unknown";
}

function iconGroup(code, isDay){
  if (code==0) return isDay? "clear-day" : "clear-night";
  if (code === 1 || code === 2) return isDay ? "partly-day" : "partly-night";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunder";
  return "partly-day";
}

function skyMood(group){
  if (group.startsWith("clear")) return "clear";
  if (group.startsWith("partly")) return "partly";
  if (group === "cloudy" || group === "fog") return "cloudy";
  if (group === "drizzle" || group === "rain") return "rain";
  if (group === "snow") return "snow";
  if (group === "thunder") return "thunder";
  return "clear";
}

const CLOUD = "M35 33.5H16.2A7.7 7.7 0 0 1 14.6 18.4 9.6 9.6 0 0 1 33 16.1 8.2 8.2 0 0 1 35 33.5Z";

function raysHTML(){
  const pts = [
    [37, 24, 42, 24], [33.2, 33.2, 36.7, 36.7], [24, 37, 24, 42], [14.8, 33.2, 11.3, 36.7],
    [11, 24, 6, 24], [14.8, 14.8, 11.3, 11.3], [24, 11, 24, 6], [33.2, 14.8, 36.7, 11.3]
  ];
  return pts.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join("");
}

function flakesHTML(offsetY) {
  return [14, 22, 30, 38].map((x) => `
    <g transform="translate(${x} ${offsetY})">
      <line x1="-3" y1="0" x2="3" y2="0"/>
      <line x1="-2.1" y1="-2.1" x2="2.1" y2="2.1"/>
      <line x1="-2.1" y1="2.1" x2="2.1" y2="-2.1"/>
    </g>`).join("");
}

const ICONS = {
  "clear-day": `<circle cx="24" cy="24" r="8.5"/>${raysHTML()}`,
  "clear-night": `<path d="M29 13a11 11 0 1 0 0 22 9 9 0 0 1 0-22Z"/><circle cx="14" cy="16" r="0.9" fill="currentColor" stroke="none"/><circle cx="10" cy="26" r="0.7" fill="currentColor" stroke="none"/>`,
  "partly-day": `<g transform="translate(-2,-3)"><circle cx="18" cy="16" r="6"/><line x1="18" y1="5" x2="18" y2="7.5"/><line x1="27" y1="14" x2="25" y2="15.6"/><line x1="9" y1="14" x2="11" y2="15.6"/></g><path d="${CLOUD}" transform="translate(2,4) scale(0.94)"/>`,
  "partly-night": `<path d="M25 10a8 8 0 1 0 0 16 6.5 6.5 0 0 1 0-16Z" transform="translate(2,0)"/><path d="${CLOUD}" transform="translate(2,4) scale(0.94)"/>`,
  "cloudy": `<path d="${CLOUD}" transform="translate(0,2)"/><path d="M25 24H10.6A6.6 6.6 0 0 1 9.4 11.2" transform="translate(-3,-6) scale(0.7)" opacity="0.55"/>`,
  "fog": `<path d="${CLOUD}" transform="translate(0,-4) scale(0.85)"/><line x1="8" y1="34" x2="40" y2="34"/><line x1="12" y1="39" x2="36" y2="39"/><line x1="16" y1="44" x2="32" y2="44"/>`,
  "drizzle": `<path d="${CLOUD}" transform="translate(0,-6) scale(0.85)"/><g stroke-linecap="round"><line x1="16" y1="34" x2="14" y2="39"/><line x1="24" y1="34" x2="22" y2="39"/><line x1="32" y1="34" x2="30" y2="39"/></g>`,
  "rain": `<path d="${CLOUD}" transform="translate(0,-6) scale(0.85)"/><g stroke-linecap="round"><line x1="15" y1="33" x2="11" y2="43"/><line x1="24" y1="33" x2="20" y2="43"/><line x1="33" y1="33" x2="29" y2="43"/></g>`,
  "snow": `<path d="${CLOUD}" transform="translate(0,-8) scale(0.85)"/>${flakesHTML(38)}`,
  "thunder": `<path d="${CLOUD}" transform="translate(0,-8) scale(0.85)"/><path d="M27 30 19 41h6l-3 9 11-13h-6l3-7Z" fill="currentColor" stroke="none"/>`
};

function weatherSVG(group, size = 48) {
  const body = ICONS[group] || ICONS["partly-day"];
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

const DETAIL_ICONS = {
  sunrise: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 18h16M6 18a6 6 0 0 1 12 0"/><path d="M12 6v3M6.3 9.3l1.8 1.8M17.7 9.3l-1.8 1.8"/><path d="M2 21h20"/></svg>`,
  sunset: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 18h16M6 18a6 6 0 0 1 12 0"/><path d="M12 9V6M6.3 9.3l1.8 1.8M17.7 9.3l-1.8 1.8"/><path d="M2 21h20"/></svg>`,
  thermo: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a2 2 0 0 0-2 2v9.3a4 4 0 1 0 4 0V5a2 2 0 0 0-2-2Z"/></svg>`,
  uv: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="14" r="5"/><path d="M12 3v2M4.2 8.2l1.4 1.4M19.8 8.2l-1.4 1.4"/></svg>`,
  pressure: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 12 15.5 9"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`
};

function paintStaticIcons() {
  document.querySelectorAll("[data-icon]").forEach((node) => {
    node.innerHTML = DETAIL_ICONS[node.dataset.icon] || "";
  });
  $("brandMark").innerHTML = weatherSVG("partly-day", 24);
  $("welcomeIcon").innerHTML = weatherSVG("partly-day", 56);
}

//  Formatting helpers
function cToF(c) {
  return (c * 9) / 5 + 32;
}

function temp(value){
  if (value===null || value===undefined ||  Number.isNaN(Number(value))) return "—";
  const converted = unit === "C" ? Number(value) : cToF(Number(value));
  return `${Math.round(converted)}°`;
}

function hourOf(value) {
  const match = value && value.match(/T(\d{2}):/);
  return match ? Number(match[1]) : 12;
}

function isDaytime(value) {
  const h = hourOf(value);
  return h >= 6 && h < 19;
}

function timeOnly(value) {
  if (!value) return "—";
  const match = value.match(/T(\d{2}:\d{2})/);
  if (!match) return value;
  const [h, m] = match[1].split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function dateOnly(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function dayName(value, index) {
  if (index === 0) return "Today";
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(`${value}T12:00:00`));
}

function setStatus(message="", opts={}){
  const {loading=false, retryable=false} =opts;
  if (!message){
    els.status.innerHTML="";
    return
  }

  if (loading){
    els.status.innerHTML = `<span class="loading">${message}</span>`;
    return
  }

  if (retryable) {
    els.status.innerHTML = `<span class="status-error">${message} <button type="button" id="retryBtn" class="retry-btn">Try again</button></span>`;
    const retryBtn = $("retryBtn");
    if (retryBtn) retryBtn.addEventListener("click", () => lastAction && lastAction());
  } else {
    els.status.textContent = message;
  }
}

function showSkeleton(show){
  els.skeleton.classList.toggle("hidden", !show);
  if (show) {
    els.weatherContent.classList.add("hidden");
    els.welcome.classList.add("hidden");
  }
}

// Networking

async function geocodeCity(city, count=1) {
  const url=`${GEOCODING_API}?name=${encodeURIComponent(city)}&count=${count}&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not search for that city.");
  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error("City not found. Try another city name.");
  }
  return data.results;
}

async function fetchWeather(latitude, longitude){
  const params=new URLSearchParams({
    latitude,
    longitude,
    current: [
      "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day",
      "precipitation", "weather_code", "wind_speed_10m", "pressure_msl"
    ].join(","),
    hourly: ["temperature_2m", "weather_code", "precipitation_probability", "wind_speed_10m"].join(","),
    daily: ["weather_code", "temperature_2m_max", "temperature_2m_min", "sunrise", "sunset", "uv_index_max"].join(","),
    timezone: "auto",
    forecast_days: "7"
  });
  const response = await fetch(`${API_BASE}?${params.toString()}`);
  if (!response.ok) throw new Error("Weather service is temporarily unavailable.");
  return response.json();
}

async function loadCity(city) {
  lastAction = () => loadCity(city);
  hideSuggestions();
  showSkeleton(true);
  setStatus(`Loading ${city}…`, { loading: true });
  try {
    const [place] = await geocodeCity(city);
    const weather = await fetchWeather(place.latitude, place.longitude);
    currentPlace = place;
    latestWeather = weather;
    renderWeather();
    setStatus("");
  } catch (error) {
    showSkeleton(false);
    setStatus(error.message || "Something went wrong.", { retryable: true });
  }
}

async function loadPlace(place) {
  lastAction = () => loadPlace(place);
  hideSuggestions();
  showSkeleton(true);
  setStatus(`Loading ${place.name}…`, { loading: true });
  try {
    const weather = await fetchWeather(place.latitude, place.longitude);
    currentPlace = place;
    latestWeather = weather;
    renderWeather();
    setStatus("");
  } catch (error) {
    showSkeleton(false);
    setStatus(error.message || "Something went wrong.", { retryable: true });
  }
}

async function loadCoordinates(latitude, longitude, label="Your location") {
  lastAction = () => loadCoordinates(latitude, longitude, label);
  showSkeleton(true);
  setStatus(`Loading ${label}…`, { loading: true });
  try {
    const weather = await fetchWeather(latitude, longitude);
    currentPlace = { name: label, country: "", latitude, longitude };
    latestWeather = weather;
    renderWeather();
    setStatus("");
  } catch (error) {
    showSkeleton(false);
    setStatus(error.message || "Something went wrong.", { retryable: true });
  }
}

// Rendering

function renderWeather(){
  if (!latestWeather || !currentPlace) return;
  const { current, hourly, daily, timezone } = latestWeather;
  const isDay = Number(current.is_day) === 1;
  const group = iconGroup(current.weather_code, isDay);

  showSkeleton(false);
  els.weatherContent.classList.remove("hidden");
  els.welcome.classList.add("hidden");

  els.cityName.textContent = currentPlace.name || "Unknown location";
  els.countryName.textContent = [currentPlace.admin1, currentPlace.country].filter(Boolean).join(", ") || "—";

  els.currentDate.textContent = current.time
    ? `${dateOnly(current.time.slice(0, 10))} • ${timezone || "Local time"}`
    : "Current conditions";

  els.weatherIcon.innerHTML = weatherSVG(group, 64);
  els.temperature.textContent = unit === "C" ? Math.round(current.temperature_2m) : Math.round(cToF(current.temperature_2m));
  els.temperatureUnit.textContent = `°${unit}`;
  els.condition.textContent = conditionText(current.weather_code);
  els.feelsLike.textContent = `Feels like ${temp(current.apparent_temperature)}`;
  els.humidity.textContent = `${Math.round(current.relative_humidity_2m)}%`;
  els.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  els.rain.textContent = `${Number(current.precipitation || 0).toFixed(1)} mm`;

  els.sunrise.textContent = timeOnly(daily.sunrise?.[0]);
  els.sunset.textContent = timeOnly(daily.sunset?.[0]);
  els.highLow.textContent = `${temp(daily.temperature_2m_max?.[0])} / ${temp(daily.temperature_2m_min?.[0])}`;
  els.uvIndex.textContent = daily.uv_index_max?.[0] != null ? uvLabel(daily.uv_index_max[0]) : "—";
  els.pressure.textContent = current.pressure_msl != null ? `${Math.round(current.pressure_msl)} hPa` : "—";
  els.localTime.textContent = timeOnly(current.time);

  document.body.classList.toggle("night", !isDay);
  paintSky(group, isDay);

  renderHourly(hourly, current.time);
  renderDaily(daily);
  els.unitToggle.textContent = `°${unit}`;
}

function uvLabel(value) {
  const v = Math.round(value);
  let band = "Low";
  if (v >= 8) band = "Very high";
  else if (v >= 6) band = "High";
  else if (v >= 3) band = "Moderate";
  return `${v} · ${band}`;
}

function paintSky(group, isDay){
  const mood=skyMood(group);
  els.heroCard.dataset.mood = mood;
  els.heroCard.dataset.time = isDay ? "day" : "night";
  els.skyOrb.innerHTML = isDay ? weatherSVG("clear-day", 46) : weatherSVG("clear-night", 46);
  const showPrecip = mood === "rain" || mood === "snow" || mood === "thunder";
  els.skyPrecip.classList.toggle("active", showPrecip);
  els.skyPrecip.dataset.kind = mood === "snow" ? "snow" : "rain";
}

function renderHourly(hourly, currentTime) {
  if (!hourly?.time?.length) return;

  let start = hourly.time.findIndex((time) => time >= currentTime);
  if (start < 0) start = 0;

  const count = 12;
  const temps = [];

  const cards = hourly.time.slice(start, start + count).map((time, offset) => {
    const i = start + offset;
    const group = iconGroup(hourly.weather_code[i], isDaytime(time));
    const probability = hourly.precipitation_probability?.[i] ?? 0;
    const isCurrent = offset === 0;
    temps.push(Number(hourly.temperature_2m[i]));

    return `
      <div class="hour-card ${isCurrent ? "current" : ""}">
        <div class="hour-time">${isCurrent ? "Now" : timeOnly(time).replace(" ", "")}</div>
        <div class="hour-icon">${weatherSVG(group, 26)}</div>
        <div class="hour-temp">${temp(hourly.temperature_2m[i])}</div>
        <div class="rain-prob">${Math.round(probability)}% rain</div>
      </div>
    `;
  }).join("");

  els.hourlyForecast.innerHTML = cards;
  drawTrend(temps);
}

function drawTrend(temps) {
  if (!temps.length) {
    els.tempTrend.innerHTML = "";
    return;
  }
  const w = 660, h = 64, pad = 10;
  const min = Math.min(...temps), max = Math.max(...temps);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (temps.length - 1 || 1);

  const points = temps.map((t, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (t - min) / range) * (h - pad * 2);
    return [x, y];
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${h} L${points[0][0].toFixed(1)},${h} Z`;

  els.tempTrend.innerHTML = `
    <defs>
      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#trendFill)" stroke="none"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

function renderDaily(daily) {
  if (!daily?.time?.length) return;

  els.dailyForecast.innerHTML = daily.time.map((date, i) => {
    const group = iconGroup(daily.weather_code[i], true);
    return `
      <div class="day-row">
        <div>
          <div class="day-name">${dayName(date, i)}</div>
          <div class="day-date">${dateOnly(date)}</div>
        </div>
        <div class="day-condition">
          <span class="day-icon">${weatherSVG(group, 24)}</span>
          <span>${conditionText(daily.weather_code[i])}</span>
        </div>
        <div class="temps">
          <span>${temp(daily.temperature_2m_max[i])}</span>
          <span class="low">${temp(daily.temperature_2m_min[i])}</span>
        </div>
      </div>
    `;
  }).join("");
}

// Search + autocomplete
function hideSuggestions(){
  suggestItems = [];
  activeSuggest = -1;
  els.suggestList.classList.add("hidden");
  els.suggestList.innerHTML = "";
  els.cityInput.setAttribute("aria-expanded", "false");
}

function renderSuggestions() {
  if (!suggestItems.length) {
    hideSuggestions();
    return;
  }
  els.suggestList.innerHTML = suggestItems.map((place, i) => `
    <li role="option" data-index="${i}" class="${i === activeSuggest ? "active" : ""}">
      <span class="suggest-name">${place.name}</span>
      <span class="suggest-meta">${[place.admin1, place.country].filter(Boolean).join(", ")}</span>
    </li>
  `).join("");
  els.suggestList.classList.remove("hidden");
  els.cityInput.setAttribute("aria-expanded", "true");
}

let debounceTimer = null;
els.cityInput.addEventListener("input", () => {
  const value = els.cityInput.value.trim();
  clearTimeout(debounceTimer);
  if (value.length < 2) {
    hideSuggestions();
    return;
  }
  debounceTimer = setTimeout(async () => {
    if (suggestAbort) suggestAbort.abort();
    suggestAbort = new AbortController();
    try {
      const url = `${GEOCODING_API}?name=${encodeURIComponent(value)}&count=5&language=en&format=json`;
      const response = await fetch(url, { signal: suggestAbort.signal });
      const data = await response.json();
      suggestItems = data.results || [];
      activeSuggest = -1;
      renderSuggestions();
    } catch (err) {
      if (err.name !== "AbortError") hideSuggestions();
    }
  }, 280);
});

els.cityInput.addEventListener("keydown", (event) => {
  if (els.suggestList.classList.contains("hidden")) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeSuggest = Math.min(activeSuggest + 1, suggestItems.length - 1);
    renderSuggestions();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    activeSuggest = Math.max(activeSuggest - 1, 0);
    renderSuggestions();
  } else if (event.key === "Escape") {
    hideSuggestions();
  } else if (event.key === "Enter" && activeSuggest >= 0) {
    event.preventDefault();
    const place = suggestItems[activeSuggest];
    els.cityInput.value = place.name;
    loadPlace(place);
  }
});

els.suggestList.addEventListener("mousedown", (event) => {
  const li = event.target.closest("li");
  if (!li) return;
  const place = suggestItems[Number(li.dataset.index)];
  els.cityInput.value = place.name;
  loadPlace(place);
});

document.addEventListener("click", (event) => {
  if (!els.searchForm.contains(event.target)) hideSuggestions();
});

els.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (activeSuggest >= 0 && suggestItems[activeSuggest]) {
    loadPlace(suggestItems[activeSuggest]);
    return;
  }
  const city = els.cityInput.value.trim();
  if (!city) {
    setStatus("Please enter a city name.");
    return;
  }
  loadCity(city);
});

els.locationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Location is not supported by this browser.", { retryable: false });
    return;
  }
  setStatus("Requesting your location…", { loading: true });
  navigator.geolocation.getCurrentPosition(
    (position) => loadCoordinates(position.coords.latitude, position.coords.longitude, "Your location"),
    () => setStatus("Location access was denied. Search for a city instead.", { retryable: false }),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
});

els.refreshBtn.addEventListener("click", () => {
  if (!currentPlace) {
    setStatus("Search for a city first.");
    return;
  }
  if (currentPlace.name === "Your location") {
    loadCoordinates(currentPlace.latitude, currentPlace.longitude, "Your location");
  } else {
    loadPlace(currentPlace);
  }
});

els.unitToggle.addEventListener("click", () => {
  unit = unit === "C" ? "F" : "C";
  if (latestWeather) renderWeather();
});

document.querySelectorAll("[data-city]").forEach((button) => {
  button.addEventListener("click", () => {
    els.cityInput.value = button.dataset.city;
    loadCity(button.dataset.city);
  });
});

// Boot
paintStaticIcons();
loadCity("Islamabad");
