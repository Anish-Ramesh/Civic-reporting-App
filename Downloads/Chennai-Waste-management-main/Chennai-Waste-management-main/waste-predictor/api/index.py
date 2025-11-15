from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import pandas as pd
import joblib
import os
from pathlib import Path

app = Flask(__name__, static_folder=None)
CORS(app)

# Get the absolute path to the saved_models directory
BASE_DIR = Path(__file__).parent.parent
MODELS_DIR = os.path.join(BASE_DIR, 'saved_models')

# Load data and models
X = pd.read_csv(os.path.join(MODELS_DIR, "X.csv"))
y = pd.read_csv(os.path.join(MODELS_DIR, "y.csv")).iloc[:, 0]
model_performance = pd.read_csv(os.path.join(MODELS_DIR, "performance.csv"))
expected_columns = pd.read_csv(os.path.join(MODELS_DIR, "columns.csv"), header=None)[0].tolist()
zone_columns = [col for col in expected_columns if col.startswith("Zone_")]

models = {}
for filename in os.listdir(MODELS_DIR):
    if filename.endswith(".pkl"):
        name = filename.replace(".pkl", "")
        model = joblib.load(os.path.join(MODELS_DIR, filename))
        models[name] = model

@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()
        total = int(data["total_households"])
        covered = int(data["covered_households"])
        zone = data["zone_name"]

        coverage = covered / total * 100 if total > 0 else 0

        input_data = {
            "Total_Households": total,
            "Covered_Households": covered,
            "Coverage_Percentage": coverage
        }

        for col in zone_columns:
            input_data[col] = 1 if col == f"Zone_{zone}" else 0

        for col in expected_columns:
            if col not in input_data:
                input_data[col] = 0

        input_df = pd.DataFrame([input_data])[expected_columns]

        total_pred = 0
        for model in models.values():
            pred = float(model.predict(input_df)[0])
            pred = max(0, pred)
            total_pred += pred

        avg_pred = total_pred / len(models) if models else 0
        print(f"HH_Source_Segregation = {avg_pred:.2f}")
        return jsonify({"HH_Source_Segregation": round(avg_pred, 2)})

    except Exception as e:
        return jsonify({"error": str(e)}), 400

# This is required for Vercel serverless functions
if __name__ == "__main__":
    app.run(debug=True)
