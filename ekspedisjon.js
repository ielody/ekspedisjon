const WORLD_GEOJSON_URL = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";
const LEADER_COLORS = {
	"Fridtjof Nansen": "#2563a6",
	"Thor Heyerdahl": "#7651a8",
	"Otto Sverdrup": "#c2185b",
	"Roald Amundsen": "#087e8b",
	"Gunnar Horn": "#b47b16",
	"Erling Kagge": "#e87524",
	"Børge Ousland": "#596579",
	"Rune Gjeldnes": "#6650a4",
	"Henrik Johan Bull": "#287f9e",
	"Carsten Borchgrevink": "#94744a",
	"Richard E. Byrd": "#7460a8",
	"Torgeir Higraff": "#a66d9b",
};
const OTTO_SVERDRUP_COLOR = "#c2185b";
const ROUTE_PALETTE = [
	"#e87524", "#287f9e", "#b47b16", "#596579", "#b14f91",
	"#4656a8", "#a35b24", "#16829a", "#80623f", "#6e6aa8",
	"#c4872c", "#3f718d", "#975d78", "#8c6c2c", "#a66d9b",
];
const MAX_MERCATOR_LATITUDE = 85.05112878;

const map = L.map("world-map", {
	worldCopyJump: true,
	minZoom: 2,
	maxZoom: 7,
	zoomControl: true,
	attributionControl: true,
}).setView([22, 4], 2);

const statusElement = document.getElementById("map-status");
const numberFormat = new Intl.NumberFormat("nb-NO");

function setStatus(message, isError = false) {
	statusElement.textContent = message;
	statusElement.classList.toggle("is-error", isError);
	statusElement.classList.remove("is-hidden");
}

function hideStatus() {
	statusElement.classList.add("is-hidden");
}

function escapeHtml(value) {
	return String(value ?? "").replace(/[&<>"']/g, (character) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
	})[character]);
}

function safeLatitude(latitude) {
	return Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
}

function getExpeditionLeader(expedition) {
	return expedition.leaders?.[0] || expedition.participants?.[0] || "Ukjent leder";
}

function isOttoSverdrupLeader(expedition) {
	const mainLeader = expedition.leaders?.[0]?.replace(/\s*\([^)]*\)/g, "").trim();
	return mainLeader === "Otto Sverdrup";
}

function buildLeaderColors(expeditions) {
	const colors = new Map(Object.entries(LEADER_COLORS));
	let paletteIndex = 0;
	for (const expedition of expeditions) {
		const leader = getExpeditionLeader(expedition);
		if (colors.has(leader)) continue;
		colors.set(leader, ROUTE_PALETTE[paletteIndex % ROUTE_PALETTE.length]);
		paletteIndex += 1;
	}
	return colors;
}

function expeditionYears(expedition) {
	if (!expedition.start_year) return "Årstall ikke oppgitt";
	if (!expedition.end_year || expedition.start_year === expedition.end_year) return String(expedition.start_year);
	return `${expedition.start_year}–${expedition.end_year}`;
}

function locationPopup(location, expeditions, leaderColors) {
	const expeditionCards = expeditions.map((expedition) => {
		const leader = getExpeditionLeader(expedition);
		const participants = [...new Set([...(expedition.leaders || []), ...(expedition.participants || [])])];
		const people = participants.length ? participants.join(", ") : "Ikke oppgitt";
		const vessel = expedition.vessel ? `<div class="popup-fact"><span>Fartøy</span><strong>${escapeHtml(expedition.vessel)}</strong></div>` : "";
		return `<article class="expedition-popup-card">
			<div class="popup-eyebrow" style="--region-color:${escapeHtml(leaderColors.get(leader) || "#e87524")}">${escapeHtml(leader)} · ${escapeHtml(expeditionYears(expedition))}</div>
			<h3>${escapeHtml(expedition.name)}</h3>
			<div class="popup-fact"><span>Deltakere</span><strong>${escapeHtml(people)}</strong></div>
			${vessel}
			<p>${escapeHtml(expedition.summary || "Ingen beskrivelse er registrert.")}</p>
		</article>`;
	}).join("");
	return `<div class="expedition-popup">
		<div class="popup-location-role">${escapeHtml(location.role || "Besøkt sted")}</div>
		<h2>${escapeHtml(location.name || "Ukjent sted")}</h2>
		${expeditionCards || "<p>Ingen ekspedisjonsdetaljer er registrert.</p>"}
	</div>`;
}

function addLegend(leaderColors, expeditions) {
	const legend = L.control({ position: "bottomright" });
	legend.onAdd = () => {
		const container = L.DomUtil.create("div", "route-legend");
		const title = L.DomUtil.create("div", "legend-title", container);
		title.textContent = "Ruter etter hovedperson";
		const routeLeaders = new Set(expeditions
			.filter((expedition) => (expedition.locations || []).filter((location) =>
				location.route && Number.isFinite(location.lat) && Number.isFinite(location.lon)).length >= 2)
			.map(getExpeditionLeader));
		const exampleByLeader = new Map();
		for (const expedition of expeditions) {
			const leader = getExpeditionLeader(expedition);
			if (routeLeaders.has(leader) && !exampleByLeader.has(leader)) {
				exampleByLeader.set(leader, expedition.name);
			}
		}
		leaderColors.forEach((color, leader) => {
			if (!routeLeaders.has(leader) || leader === "Otto Sverdrup") return;
			const row = L.DomUtil.create("div", "legend-row", container);
			const swatch = L.DomUtil.create("span", "legend-swatch route-swatch", row);
			swatch.style.backgroundColor = color;
			const example = {
				"Fridtjof Nansen": "Fram",
				"Thor Heyerdahl": "Kon-Tiki",
			}[leader] || exampleByLeader.get(leader) || "";
			const label = example ? `${leader} · ${example}` : leader;
			L.DomUtil.create("span", "", row).textContent = label;
		});
		const ottoRow = L.DomUtil.create("div", "legend-row", container);
		const ottoSwatch = L.DomUtil.create("span", "place-swatch", ottoRow);
		ottoSwatch.style.backgroundColor = OTTO_SVERDRUP_COLOR;
		L.DomUtil.create("span", "", ottoRow).textContent = "Otto Sverdrup – ekspedisjoner ledet";
		const place = L.DomUtil.create("div", "legend-row", container);
		const markerSwatch = L.DomUtil.create("span", "place-swatch", place);
		markerSwatch.textContent = "";
		L.DomUtil.create("span", "", place).textContent = "Andre ekspedisjoner";
		L.DomEvent.disableClickPropagation(container);
		return container;
	};
	legend.addTo(map);
}

function drawRoute(expedition, color, leaderColors) {
	const routeLocations = (expedition.locations || []).filter((location) =>
		location.route && Number.isFinite(location.lat) && Number.isFinite(location.lon));
	if (routeLocations.length < 2) return;

	let segment = [[safeLatitude(routeLocations[0].lat), routeLocations[0].lon]];
	const segments = [];
	for (let index = 1; index < routeLocations.length; index += 1) {
		const previous = routeLocations[index - 1];
		const current = routeLocations[index];
		if (Math.abs(current.lon - previous.lon) > 180) {
			if (segment.length > 1) segments.push(segment);
			segment = [[safeLatitude(current.lat), current.lon]];
			continue;
		}
		segment.push([safeLatitude(current.lat), current.lon]);
	}
	if (segment.length > 1) segments.push(segment);
	if (!segments.length) return;

	const leader = getExpeditionLeader(expedition);
	const route = L.polyline(segments, {
		color,
		weight: 2.5,
		opacity: 0.78,
		dashArray: "7 6",
		lineCap: "round",
		lineJoin: "round",
	}).addTo(map);
	route.bindTooltip(`${escapeHtml(expedition.name)} · ${escapeHtml(leader)}`, { sticky: true });
	route.bindPopup(locationPopup({ name: expedition.name, role: leader }, [expedition], leaderColors), { maxWidth: 360, minWidth: 260 });
}

function renderMap(expeditionData, worldData) {
	const expeditions = expeditionData.expeditions || [];
	const leaderColors = buildLeaderColors(expeditions);
	const allLocations = [];
	const locationsByCoordinate = new Map();

	L.geoJSON(worldData, {
		style: {
			fillColor: "#ffffff",
			fillOpacity: 1,
			color: "#bdc8ce",
			weight: 0.65,
			opacity: 0.9,
			lineJoin: "round",
		},
		interactive: false,
	}).addTo(map);

	for (const expedition of expeditions) {
		const leader = getExpeditionLeader(expedition);
		const color = leaderColors.get(leader);
		drawRoute(expedition, color, leaderColors);
		for (const location of expedition.locations || []) {
			if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) continue;
			const coordinateKey = `${location.lat},${location.lon}`;
			let entry = locationsByCoordinate.get(coordinateKey);
			if (!entry) {
				entry = { locations: [], expeditions: [], lat: location.lat, lon: location.lon };
				locationsByCoordinate.set(coordinateKey, entry);
				allLocations.push(entry);
			}
			if (!entry.locations.some((item) => item.name === location.name && item.role === location.role)) {
				entry.locations.push(location);
			}
			if (!entry.expeditions.some((item) => item.id === expedition.id)) {
				entry.expeditions.push(expedition);
			}
		}
	}

	for (const entry of allLocations) {
		const location = {
			name: entry.locations.map((item) => item.name).filter(Boolean).join(" / "),
			role: [...new Set(entry.locations.map((item) => item.role).filter(Boolean))].join(" · ") || "Besøkt sted",
			lat: entry.lat,
			lon: entry.lon,
		};
		const markerColor = entry.expeditions.some(isOttoSverdrupLeader)
			? OTTO_SVERDRUP_COLOR
			: leaderColors.get(getExpeditionLeader(entry.expeditions[0]));
		const marker = L.circleMarker([safeLatitude(location.lat), location.lon], {
			radius: 5.5,
			color: "#ffffff",
			weight: 1.5,
			fillColor: markerColor,
			fillOpacity: 1,
		}).addTo(map);
		marker.bindTooltip(escapeHtml(location.name || "Besøkt sted"), { direction: "top", offset: [0, -5] });
		marker.bindPopup(locationPopup(location, entry.expeditions, leaderColors), { maxWidth: 360, minWidth: 260 });
	}

	addLegend(leaderColors, expeditions);
	document.getElementById("visited-count").textContent = numberFormat.format(allLocations.length);
	document.getElementById("expedition-count").textContent = numberFormat.format(expeditions.length);
	hideStatus();
}

async function loadMapData() {
	try {
		const [expeditionResponse, worldResponse] = await Promise.all([
			fetch("expeditions.json"),
			fetch(WORLD_GEOJSON_URL),
		]);
		if (!expeditionResponse.ok || !worldResponse.ok) throw new Error("Kartdataene kunne ikke lastes ned.");
		const [expeditionData, worldData] = await Promise.all([
			expeditionResponse.json(),
			worldResponse.json(),
		]);
		renderMap(expeditionData, worldData);
	} catch (error) {
		console.error("Kunne ikke laste verdenskartet:", error);
		setStatus("Kartet kunne ikke lastes. Åpne siden via en lokal webserver og kontroller nettilkoblingen.", true);
	}
}

loadMapData();
