const sliderContainer = document.getElementById('year-range-slider');
const applyBtn = document.getElementById('applyBtn');
let chart = null;

// API base URL - Flask backend
const API_BASE = 'http://127.0.0.1:5000';

// Initialize Chart.js
function initializeChart() {
    const unitType = document.getElementById('unitFilter').value;
    let unit = unitType === 'Tonnes - live weight' ? 'Million Tonnes' : 'Number'

    const ctx = document.getElementById('myChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: `Production (${unit})`,
                data: [],
                borderColor: '#0099ff',
                backgroundColor: 'rgba(0, 153, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#0099ff',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        font: { size: 14 },
                        padding: 15
                    }
                },
                title: {
                    display: true,
                    text: 'Production Over Time',
                    font: { size: 16, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: `Production (${unit})`
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Year'
                    }
                }
            }
        }
    });
}

noUiSlider.create(sliderContainer, {
    start: [1950, 2023],
    connect: true,
    step: 1,
    range: {
        "min": 1950,
        "max": 2023
    },
    tooltips: true,
    format: {
        to: function(value) {
            return Math.round(value);
        },
        from: function(value) {
            return Math.round(value);
        }
    }
});

sliderContainer.noUiSlider.on('update', function(values, handle) {
    const minYear = values[0];
    const maxYear = values[1];
});

async function populateDropdowns() {
    try {
        // Fetch unique FAO Areas
        const areasResponse = await fetch(`${API_BASE}/api/areas`);
        const areas = await areasResponse.json();
        const faoAreaSelect = document.getElementById('faoAreaFilter');
        areas.forEach(area => {
            const option = document.createElement('option');
            option.value = area.code;
            option.textContent = `${area.code} - ${area.name}`;
            faoAreaSelect.appendChild(option);
        });

        // Fetch unique ISSCAAP Groups
        const isscaapResponse = await fetch(`${API_BASE}/api/isscaap`);
        const isscaapGroups = await isscaapResponse.json();
        const isscaapSelect = document.getElementById('isscaapFilter');
        isscaapGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.code;
            option.textContent = `${group.code} - ${group.name}`;
            isscaapSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error populating dropdowns:', error);
    }
}

function updateChart(data) {
    if (!chart) {
        console.error('Chart not initialized');
        return;
    }

    // Sort data by year
    data.sort((a, b) => a.x - b.x);

    // Extract labels (years) and values (production)
    const labels = data.map(d => d.x);
    const values = data.map(d => d.y);

    // Extract unit type from selection
    const unitType = document.getElementById('unitFilter').value;
    let unit = unitType === 'Tonnes - live weight' ? 'Million Tonnes' : 'Number'

    // Update chart data
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].label = `Production (${unit})`;
    chart.options.scales.y.title.text = `Production (${unit})`;
    chart.update();
}


applyBtn.addEventListener('click', function() {
    const yearValues = sliderContainer.noUiSlider.get();
    const minYear = Math.round(yearValues[0]);
    const maxYear = Math.round(yearValues[1]);
    
    const faoArea = document.getElementById('faoAreaFilter').value;
    const isscaap = document.getElementById('isscaapFilter').value;
    const productionType = document.getElementById('productionTypeFilter').value;
    const unitType = document.getElementById('unitFilter').value;
    
    // Build request body
    const requestBody = {
        min_year: minYear,
        max_year: maxYear,
        unit: unitType
    };
    
    // Convert string values to appropriate types and add to request if present
    if (faoArea) requestBody.Area = parseInt(faoArea, 10);
    if (isscaap) requestBody.ISSCAAP_Group_Code = parseInt(isscaap, 10);
    if (productionType) requestBody.Type = productionType;

    console.log('Request Body:', requestBody);
    
    // Fetch data with POST request
    fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    })
        .then(response => response.json())
        .then(data => {
            console.log('Query data:', data);
            // Update chart with new data
            updateChart(data);
        })
        .catch(error => console.error('Error fetching data:', error));
});



document.addEventListener('DOMContentLoaded', function() {
    initializeChart();
    populateDropdowns();
    
    applyBtn.click();
});