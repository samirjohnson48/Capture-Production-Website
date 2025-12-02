# backend/app.py
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import pandas as pd
import os
import requests
import json

# Get the path to the frontend directory
template_path = os.path.join(os.path.dirname(__file__), 'templates')
static_path = os.path.join(os.path.dirname(__file__), 'static')

app = Flask(__name__, template_folder=template_path, static_folder=static_path, static_url_path="/static")
CORS(app)  # allow Cross-Origin requests for dev; restrict in production

# Load dataset from GitHub
PRODUCTION_URL = "https://raw.githubusercontent.com/samirjohnson48/Capture-Production-Website/refs/heads/main/data/csv/FAO_global_production.csv"
ASFIS_URL = "https://raw.githubusercontent.com/samirjohnson48/Capture-Production-Website/refs/heads/main/data/csv/ASFIS_sp_2025.csv"
ISSCAAP_URL = "https://raw.githubusercontent.com/samirjohnson48/Capture-Production-Website/refs/heads/main/data/csv/ISSCAAP.csv"
AREAS_URL = "https://raw.githubusercontent.com/samirjohnson48/Capture-Production-Website/refs/heads/main/data/csv/FAO_Major_Fishing_Areas.csv"


p_df = pd.read_csv(PRODUCTION_URL)
asfis_df = pd.read_csv(ASFIS_URL)
isscaap_df = pd.read_csv(ISSCAAP_URL)
areas_df = pd.read_csv(AREAS_URL)


# Change asfis ISSCAAP column to integer type for proper merging
asfis_df['ISSCAAP_Group_Code'] = asfis_df['ISSCAAP_Group_Code'].fillna(-1).astype('Int64')

# Merge datasets on relevant keys
df = p_df.merge(asfis_df, how='left', on="Alpha3_Code")
df = df.merge(isscaap_df, how='left', on="ISSCAAP_Group_Code")

# Set global variables
MIN_YEAR = 1950
MAX_YEAR = 2023

def apply_filter(
    data: pd.DataFrame, 
    args: dict, 
    filter_key) -> pd.DataFrame:
    
    filter_value = args.get(filter_key)
    
    if filter_value is None or filter_value == "":
        return data
    
    try:
        if isinstance(filter_value, list):
            data = data[data[filter_key].isin(filter_value)]
        else:
            data = data[data[filter_key] == filter_value]
    except Exception as e:
        print(f"Error applying filter {filter_key}={filter_value}: {e}")
        
    return data

@app.route("/query", methods=["GET", "POST"])
def query() -> jsonify:
    """
    Query parameters (GET) or JSON body (POST):
      - min_year, max_year: filter year range
      - Type: filter by type (e.g. "Capture" or "Aquaculture")
      - Area: filter by FAO Area
      - ISSCAAP_Group_Code: filter by ISSCAAP group code
    Returns JSON: list of {year:..., production:..., ...} rows
    """
    # Get parameters from either query string (GET) or JSON body (POST)
    if request.method == 'POST':
        args = request.get_json() or {}
    else:
        args = request.args

    data = df.copy()
    print(f"Initial data rows: {len(data)}")
    print(f"Filters received: {dict(args)}")
    
    # Apply filters based on query parameters
    for filter_key in args.keys():
        if filter_key not in ["min_year", "max_year", "unit"]:
            data_before = len(data)
            data = apply_filter(data, args, filter_key)
            data_after = len(data)
            print(f"After filtering by {filter_key}={args.get(filter_key)}: {data_before} -> {data_after} rows")
    
    # Convert min_year and max_year to integers
    min_year = int(args.get("min_year", MIN_YEAR))
    max_year = int(args.get("max_year", MAX_YEAR))
    
    # Get year columns as strings (they are column names in the CSV)
    years = [str(year) for year in range(min_year, max_year + 1)]
    
    # Select only the year columns that exist in the dataframe
    year_cols = [col for col in years if col in data.columns]
    
    if not year_cols:
        print("No year columns found!")
        return jsonify([])
    
    # Sum production across all records for each year
    production_by_year = data[year_cols].sum()
    print(f"Total production values: {production_by_year.values[:5]}")
    
    # Build response records (x, y) for plotting
    # Check for both 'unit' (lowercase) and 'Unit' (uppercase) for compatibility
    unit_value = args.get('unit') or args.get('Unit')
    
    if unit_value == 'Tonnes - live weight':
        print("Returning production in Million Tonnes")
        records = [
            {"x": int(year), "y": float(production / 1e6)}  # Return in million tonnes
            for year, production in production_by_year.items()
        ]
    elif unit_value == 'Number':
        print("Returning production in Number")
        records = [
        {"x": int(year), "y": int(production)}  # Return in number
        for year, production in production_by_year.items()
        ]
    else:
        raise ValueError("Invalid or missing 'unit' parameter. Must be 'Tonnes - live weight' or 'Number'.")
    
    # Sort by year
    records.sort(key=lambda x: x["x"])
    print(f"Returning {len(records)} records")

    return jsonify(records)


@app.get("/api/areas")
def get_areas() -> jsonify:
    """Returns list of unique FAO Areas"""
    areas = areas_df[["Code", "Name"]].dropna().drop_duplicates()
    result = [
        {
            'code': int(row['Code']),
            'name': row['Name']
        }
        for _, row in areas.iterrows()
    ]
    result.sort(key=lambda x: x['code'])
    return jsonify(result)


@app.get("/api/isscaap")
def get_isscaap() -> jsonify:
    """Returns list of unique ISSCAAP groups with codes and names"""
    isscaap_groups = df[['ISSCAAP_Group_Code', 'ISSCAAP_Group_Name']].dropna().drop_duplicates()
    result = [
        {
            'code': int(row['ISSCAAP_Group_Code']),
            'name': row['ISSCAAP_Group_Name']
        }
        for _, row in isscaap_groups.iterrows()
    ]
    result.sort(key=lambda x: x['code'])
    return jsonify(result)


@app.get("/api/fao-areas-geojson")
def get_fao_areas_geojson() -> jsonify:
    """Returns FAO areas as GeoJSON from datasets folder"""
    geojson_url = "raw.githubusercontent.com/samirjohnson48/Capture-Production-Website/refs/heads/main/data/json/FAO_major_fishing_areas.json"
    
    try:
        response = requests.get(f"https://{geojson_url}")
        response.raise_for_status()
        
        fao_areas_geojson = response.json()
    except Exception as e:
        print(f"Error fetching FAO areas GeoJSON: {e}")
        
        try:
            with open(os.path.join('data', 'json', 'FAO_major_fishing_areas.json'), 'r') as f:
                fao_areas_geojson = json.load(f)
        except Exception as e:
            print(f"Error loading local FAO areas GeoJSON: {e}")
            fao_areas_geojson = {}
        
    return jsonify(fao_areas_geojson)


@app.get("/api/area-stats/<int:area_code>")
def get_area_stats(area_code) -> jsonify:
    """Returns statistics for a specific FAO area"""
    # Filter data by area
    area_data = df[df['Area'] == area_code]
    
    if area_data.empty:
        return jsonify({"error": "Area not found"}), 404
    
    # Get the area name
    area_info = areas_df[areas_df['Code'] == area_code]
    area_name = area_info['Name'].values[0] if not area_info.empty else f"Area {area_code}"
    
    # Calculate statistics
    # Get production data for the last available year and average
    year_cols = [col for col in area_data.columns if col.isdigit()]
    year_cols_sorted = sorted(year_cols)
    
    if not year_cols_sorted:
        return jsonify({
            "code": area_code,
            "name": area_name,
            "production_2023": 0,
            "avg_production": 0,
            "trend": 0
        })
    
    # Sum across all records for each year
    production_by_year = area_data[year_cols_sorted].sum()
    
    # Get latest year data (2023 or latest available)
    latest_year = year_cols_sorted[-1]
    production_2023 = float(production_by_year[latest_year])
    
    # Calculate average production (last 10 years if available)
    recent_years = year_cols_sorted[-10:] if len(year_cols_sorted) >= 10 else year_cols_sorted
    avg_production = float(production_by_year[recent_years].mean())
    
    # Calculate trend (compare last year to first year of recent data)
    if len(recent_years) > 1:
        first_recent = float(production_by_year[recent_years[0]])
        last_recent = float(production_by_year[recent_years[-1]])
        trend = ((last_recent - first_recent) / first_recent * 100) if first_recent > 0 else 0
    else:
        trend = 0
    
    return jsonify({
        "code": area_code,
        "name": area_name,
        "production_2023": int(production_2023),
        "avg_production": int(avg_production),
        "trend": trend
    })


@app.get("/map")
def serve_world_map():
    return render_template("map.html")


@app.get("/graph")
def serve_graph():
    return render_template("graph.html")

@app.route("/")
def serve_home():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True)
