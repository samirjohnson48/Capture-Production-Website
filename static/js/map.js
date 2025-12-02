const API_BASE = 'http://127.0.0.1:5000';
const COUNTRIES_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';
const FAO_AREAS_URL = 'https://raw.githubusercontent.com/samirjohnson48/Capture-Production-Website/refs/heads/main/data/json/FAO_major_fishing_areas.json';
let activeAreaId = null;

const projectionBtn = document.getElementById('projectionBtn');
const yearSlider = document.getElementById('yearSlider');
const tooltip = d3.select("body").append("div").attr("class", "tooltip");

const container = document.getElementById('map-container');
const width = container.clientWidth;
const height = container.clientHeight;

const projectionTypes = {
    'mercator': d3.geoMercator()
        .scale((width) / 2 / Math.PI)
        .translate([width / 2, height / 2]),
    'orthographic': d3.geoOrthographic()
        .scale((Math.min(width, height) / 2) - 10)
        .translate([width / 2, height / 2])
        .clipAngle(90),
    'natural': d3.geoNaturalEarth1()
        .scale(width / 2 / Math.PI)
        .translate([width / 2, height / 2])
}

let settings = {
    projection: projectionBtn.dataset.value,
    year: yearSlider.value
}

// Set up dropdown menus
dropdowns = document.querySelectorAll('.dropdown');

dropdowns.forEach(dropdown => {
    const dropdownBtn = dropdown.querySelector('.dropdown-button');
    const dropdownContent = dropdown.querySelector('.dropdown-content');
    const dropdownItems = dropdownContent.querySelectorAll('.dropdown-item');
    const dropdownName = dropdownContent.id.replace("Menu", "");

    console.log(dropdownName);

    dropdownContent.classList.add('hidden');

    dropdownBtn.addEventListener('click', () => {
        dropdownContent.classList.toggle('hidden');
    });

    dropdownItems.forEach(item => {
        item.addEventListener('click', () => {
            dropdownItems.forEach(i => {i.classList.remove('selected')});
            item.classList.add('selected');
            dropdownBtn.textContent = item.textContent;
            dropdownContent.classList.add('hidden');
            settings[dropdownName] = item.dataset.value;
            setTimeout(() => {
                updateMap(dropdownName, item.dataset.value);
            }, 50);
        });
    });

    document.addEventListener('click', (event) => {
        if (!dropdown.contains(event.target)) {
            dropdownContent.classList.add('hidden');
        }
    });
});

// Set up SVG map container
const svg = d3.select("#map")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
const mapGroup = svg.append("g");

// Use default projection
var projection = projectionTypes[projectionBtn.dataset.value || 'natural'];
var path = d3.geoPath().projection(projection);


async function loadMapData() {
    try {
        const [worldData, faoData] = await Promise.all([
            d3.json(COUNTRIES_URL),
            d3.json(FAO_AREAS_URL)
        ]);

        mapGroup.selectAll(".continent")
            .data(worldData.features)
            .enter().append("path")
            .attr("d", path)
            .attr("class", "continent animate-load")
            .style("animation-delay", "0s");

        mapGroup.selectAll(".fao-area")
            .data(faoData.features)
            .enter().append("path")
            .attr("d", path)
            .attr("class", "fao-area animate-load")
            .style("fill", d => getAreaColor(d.properties.Code))
            .style("animation-delay", "0.5s")
            .on("mouseover", function(event, d) {
                d3.select(this).raise();
                showTooltip(event, d.properties);
            })
            .on("mouseout", function() {
                hideTooltip();
            })
            .on("click", function(event, d) {
                handleAreaClick(d.properties, this);
            });

        
        const zoom = d3.zoom()
            .scaleExtent([1, 8])
            .on("zoom", (event) => {
                mapGroup.attr("transform", event.transform);
            });
        svg.call(zoom);

    } catch (error) {
        console.error("Error loading map data:", error);
    }
}


function updateMap(settingType, value) {
    switch (settingType) {
        case 'projection':
            try {
                projection = projectionTypes[value];
                path = d3.geoPath().projection(projection);
                redrawMap(path);
            }
            catch (error) {
                console.error("Error updating projection:", error);
            }
            break;
        case 'year':
            // Future implementation for year-based data updates
            console.log(`Year changed to ${value}, but no year-based data to update yet.`);
            break;
        default:
            console.warn(`Unknown setting type: ${settingType}`);
    }
}

function toggleLoading(show) {
    const loader = document.getElementById('mapLoader');
    if (show) {
        loader.classList.remove('hidden');
    } else {
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 100); 
    }
}

function redrawMap(pathGenerator) {
    toggleLoading(true);
    mapGroup.selectAll("path").attr("d", pathGenerator);
    setTimeout(() => {
        toggleLoading(false);
    }, 500);
}

function handleAreaClick(properties, element) {
    d3.selectAll(".fao-area").classed("active", false);
    
    d3.select(element).classed("active", true).raise();
    
    activeAreaId = properties.F_CODE;
    showAreaStatistics(activeAreaId, properties.F_NAME);
}

function showTooltip(event, props) {
    tooltip.style("opacity", 1)
           .html(`<strong>${props.F_NAME}</strong> (Area ${props.F_CODE})`)
           .style("left", (event.pageX + 10) + "px")
           .style("top", (event.pageY - 28) + "px");
    console.log("Showing tooltip for props:", props);
}

function hideTooltip() {
    tooltip.style("opacity", 0);
}

function getAreaColor(code) {
    const colors = ['#48cae4', '#00b4d8', '#0096c7', '#0077b6', '#023e8a'];
    return colors[code % colors.length];
}


async function showAreaStatistics(areaCode, areaName) {
    const sidebar = document.getElementById('sidebar');
    const areaTitle = document.getElementById('areaTitle');
    const areaStats = document.getElementById('areaStats');
    
    sidebar.classList.add('open');
    areaTitle.textContent = `${areaName} (Area ${areaCode})`;
    
    try {
        const response = await fetch(`${API_BASE}/api/area-stats/${areaCode}`);
        const stats = await response.json();
        
        areaStats.innerHTML = `
            <p><strong>Production:</strong> ${stats.production_2023 || 'N/A'} tonnes</p>
            <p><strong>Trend:</strong> ${stats.trend || 'Stable'}</p>
        `;
    } catch(e) {
        areaStats.innerHTML = "<p>Loading stats...</p>";
    }
}

document.getElementById('closeSidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    d3.selectAll(".fao-area").classed("active", false);
});


document.addEventListener('DOMContentLoaded', function() {
    loadMapData();
});