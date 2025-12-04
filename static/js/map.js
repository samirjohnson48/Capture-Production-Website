const API_BASE = 'http://127.0.0.1:5000';
const COUNTRIES_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';
const FAO_AREAS_URL = 'https://raw.githubusercontent.com/samirjohnson48/Capture-Production-Website/refs/heads/main/data/json/FAO_major_fishing_areas.json';

let activeAreaId = null;
let areaProduction = null;
let countryProduction = null;

const projectionBtn = document.getElementById('projectionBtn');
const projectionBtns = document.getElementById("projectionMenu").querySelectorAll(".dropdown-item");
const naturalProjBtn = document.getElementById("naturalBtn");
const yearSlider = document.getElementById('yearSlider');
const yearLabel = document.getElementById('yearLabel');
const tooltip = d3.select("body").append("div").attr("class", "tooltip");

const MIN_PRODUCTION = 0;
const MAX_PRODUCTION = 10; // in MT
const productionColorScale = d3.scaleSequential()
    .domain([MIN_PRODUCTION, MAX_PRODUCTION])
    .interpolator(d3.interpolateBlues);


const container = document.getElementById('map-container');
const width = container.clientWidth;
const height = container.clientHeight;

const zoomScale = {
    min: 1,
    max: 8
}

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

// Set up dropdown menus
const dropdowns = document.querySelectorAll('.dropdown');

dropdowns.forEach(dropdown => {
    const dropdownBtn = dropdown.querySelector('.dropdown-button');
    const dropdownContent = dropdown.querySelector('.dropdown-content');
    const dropdownItems = dropdownContent.querySelectorAll('.dropdown-item');
    const dropdownName = dropdownContent.id.replace("Menu", "");

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

// Set up projection buttons
projectionBtns.forEach(projBtn => {
    projBtn.addEventListener("click", () => {
        const projectionType = projBtn.dataset.value;
    });
});

// Set up year slider
yearSlider.addEventListener('input', () => {
    yearLabel.textContent = yearSlider.value;
    updateColors("Area");
})

// Set up SVG map container
const svg = d3.select("#map")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
const mapGroup = svg.append("g");

const zoom = d3.zoom()
    .scaleExtent([zoomScale.min, zoomScale.max])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", (event) => {
        mapGroup.attr("transform", event.transform);
    });
const sensitivity = 75;
const drag = d3.drag()
    .on('start', () => {
            d3.selectAll(".fao-area").classed("active", false);

            activeAreaId = null;
    })
    .on('drag', (event) => {
        const rotate = projection.rotate();
        const k = sensitivity / projection.scale();
        
        projection.rotate([
            rotate[0] + event.dx * k,
            rotate[1] - event.dy * k 
        ]);
        
        path = d3.geoPath().projection(projection);
        mapGroup.selectAll("path").attr("d", path);
    });

// Use default projection
let projection = projectionTypes[projectionBtn.dataset.value || "natural"];
let path = d3.geoPath().projection(projection);


async function loadMapData() {
    try {
        toggleLoading(false);

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
            .style("fill", d => getAreaColor(d.properties.F_CODE))
            .style("animation-delay", "0s")
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

        svg.call(zoom);

        naturalProjBtn.classList.add('selected');

        createLegend();

        setTimeout(() => {mapGroup.selectAll(".fao-area").style("animation", "none");}, 1500);

    } catch (error) {
        console.error("Error loading map data:", error.message);
    }
}

function createLegend() {
    const legendWidth = 250;
    const legendHeight = 20;
    
    const legendX = (width - legendWidth) / 2;
    const legendY = height - legendHeight - 30;

    const legendGroup = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${legendX}, ${legendY})`);

    const linearGradient = svg.append("defs")
        .append("linearGradient")
        .attr("id", "legend-gradient")
        .attr("x1", "0%")
        .attr("x2", "100%");

    linearGradient.selectAll("stop")
        .data(d3.range(0, 1.01, 0.05))
        .enter().append("stop")
        .attr("offset", d => `${d * 100}%`)
        .attr("stop-color", d => productionColorScale(d * MAX_PRODUCTION));

    legendGroup.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#legend-gradient)")
        .style("stroke", "#333");

    const legendAxisScale = d3.scaleLinear()
        .domain([MIN_PRODUCTION, MAX_PRODUCTION])
        .range([0, legendWidth]);

    const legendAxis = d3.axisBottom(legendAxisScale)
        .ticks(5)
        .tickFormat(d => {
            if (d === 10) return `${d}+ MT`;
            else return `${d} MT`;
        });

    legendGroup.append("g")
        .attr("class", "legend-axis")
        .attr("transform", `translate(0, ${legendHeight})`)
        .call(legendAxis);

    legendGroup.append("text")
        .attr("x", 0)
        .attr("y", -5)
        .style("text-anchor", "start")
        .style("fill", "#a18cffff")
        .style("font-size", "12px")
        .text("Total Production");
}


function updateMap(settingType, value) {
    switch (settingType) {
        case 'projection':
            try {
                projection = projectionTypes[value];
                path = d3.geoPath().projection(projection);
                setInteractionBehavior(value);
                redrawMap(path);
            }
            catch (error) {
                console.error("Error updating projection:", error);
            }
            break;
        case 'year':
            updateColors("Area");
            break;
        default:
            console.warn(`Unknown setting type: ${settingType}`);
    }
}

function redrawMap(pathGenerator) {
    toggleLoading(true);
    mapGroup.selectAll("path").attr("d", pathGenerator);
    setTimeout(() => {
        toggleLoading(false);
    }, 500);
}

function toggleLoading(show) {
    const loader = document.getElementById('mapLoader');

    if (!loader) return;

    if (show) {
        loader.classList.remove('hidden');
    } else {
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 100); 
    }
}

function setInteractionBehavior(projectionType) {
    svg.on(".zoom", null);
    svg.on(".drag", null);
    
    mapGroup.attr("transform", "translate(0,0) scale(1)");

    if (projectionType === 'orthographic') {
        svg.call(drag);
        
        projection.rotate([0, 0]);        
        redrawMap(path);
    } else {
        svg.call(zoom.transform, d3.zoomIdentity);
        svg.call(zoom);
    }
}

function handleAreaClick(properties, element) {
    d3.selectAll(".fao-area").classed("active", false);
    
    d3.select(element).classed("active", true).raise();
    
    activeAreaId = properties.F_CODE;
    showAreaStatistics(activeAreaId, properties.F_NAME);
}

function showTooltip(event, props) {
    tooltipBody = `<strong>${props.F_NAME}</strong> (Area ${props.F_CODE}) </br>
                   ${yearSlider.value} Production: ${getAreaProduction(props.F_CODE).toFixed(2)} MT`

    tooltip.style("opacity", 1)
           .html(tooltipBody)
           .style("left", (event.pageX + 10) + "px")
           .style("top", (event.pageY - 28) + "px");
}

function hideTooltip() {
    tooltip.style("opacity", 0);
}

function getAreaProduction(code) {
    const yearData = areaProduction[yearSlider.value];
    const productionValue = yearData ? yearData[code] : null;

    if (productionValue !== null && productionValue !== undefined) {
        return productionValue;
    }

    console.log(`Invalid production value for Area ${code} in year ${yearSlider.value}`);

    return productionValue;
}


function getAreaColor(code) {
    if (!areaProduction) {
        console.log("Area production not queried yet.");
        return "#808080";
    }

    productionValue = getAreaProduction(code);

    if (productionValue !== null && productionValue !== undefined) {
        return productionColorScale(productionValue);
    }

    console.log(`Production not found for area ${code} in year ${yearSlider.value}`);

    return "#808080";
}

function getCountryColor(country) {
    if (!countryProduction) {
        console.log("Country production not queried yet.");
        return "#808080";
    }

    const yearData = countryProduction[yearSlider.value];
    const productionValue = yearData ? yearData[country] : null;

    if (productionValue !== null && productionValue !== undefined) {
        return productionColorScale(productionValue);
    }

    console.log(`Production not found for country ${country} in year ${yearSlider.value}`);

    return "#808080";
}

function updateColors(region_type) {
    if (region_type === "Area") {
        mapGroup.selectAll(".fao-area")
            .transition().duration(200)
            .style("fill", (d) => getAreaColor(d.properties.F_CODE));
    }
    else if (region_type === "Country") {
        mapGroup.selectAll(".continent")
            .transition().duration(200)
            .style("fill", (d) => getCountryColor(d.properties.Name));
    }
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

async function getProductionData() {
    toggleLoading(true);
    
    try {
        const areaResponse = await fetch(`${API_BASE}/api/production/area`);
        const countryResponse = await fetch(`${API_BASE}/api/production/country`);

        areaProduction = await areaResponse.json();
        countryProduction = await countryResponse.json();
    }
    catch(e) {
        console.error("Error in fetching production data :", error.message);
    }
}


document.addEventListener('DOMContentLoaded', async function() {
    await getProductionData();
    loadMapData();
});