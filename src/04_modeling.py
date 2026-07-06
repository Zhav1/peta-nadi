import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import matplotlib.pyplot as plt
import seaborn as sns
import shap

def main():
    os.makedirs('outputs/tables', exist_ok=True)
    os.makedirs('outputs/figures', exist_ok=True)

    df = pd.read_parquet('data/processed/master_dataset_v2.parquet')
    
    features = [
        'temp_avg_c', 'temp_max_c', 'temp_min_c', 'kelembapan_pct', 'curah_hujan_mm', 'kec_angin_ms',
        'korban_meninggal', 'korban_mengungsi', 'rumah_rusak_berat', 'rumah_rusak_ringan',
        'kemiskinan_pct', 'kepadatan_penduduk', 'produksi_padi_ribu_ton', 'pdrb_per_kapita_juta', 'panjang_jalan_km'
    ]
    target = 'harga_beras_mean'
    
    data = df[features + [target]].dropna()
    X = data[features]
    y = data[target]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Models with specific hyperparameters requested
    models = {
        'Linear Regression': LinearRegression(),
        'Random Forest': RandomForestRegressor(n_estimators=200, max_depth=15, max_features='sqrt', random_state=42)
    }
    
    results = []
    for name, model in models.items():
        # 5-Fold Cross Validation for R2
        cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring='r2')
        cv_r2_mean = cv_scores.mean()
        
        # Fit on whole train for evaluation on test
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        
        test_r2 = r2_score(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        
        results.append({
            'Model': name,
            'CV_5Fold_R2': cv_r2_mean,
            'Test_R2': test_r2,
            'MAE': mae,
            'RMSE': rmse
        })
    
    results_df = pd.DataFrame(results)
    results_df.to_csv('outputs/tables/Table_4_Model_Comparison.csv', index=False)
    
    # 4-Panel Diagnostics for Random Forest
    rf_model = models['Random Forest']
    importances = rf_model.feature_importances_
    feat_imp_df = pd.DataFrame({'Feature': features, 'Importance': importances}).sort_values(by='Importance', ascending=False)
    
    y_pred_rf = rf_model.predict(X_test)
    residuals = y_test - y_pred_rf
    
    fig, axes = plt.subplots(2, 2, figsize=(18, 14))
    
    # 1. Feature Importance
    sns.barplot(x='Importance', y='Feature', data=feat_imp_df.head(10), palette='mako', ax=axes[0, 0])
    axes[0, 0].set_title('Top 10 Feature Importance')
    
    # 2. Predicted vs Actual
    axes[0, 1].scatter(y_test, y_pred_rf, alpha=0.3, color='blue')
    axes[0, 1].plot([y_test.min(), y_test.max()], [y_test.min(), y_test.max()], 'r--', lw=2)
    axes[0, 1].set_title('Predicted vs Actual')
    axes[0, 1].set_xlabel('Actual Price')
    axes[0, 1].set_ylabel('Predicted Price')
    
    # 3. Residual Distribution
    sns.histplot(residuals, kde=True, ax=axes[1, 0], color='purple')
    axes[1, 0].set_title('Residual Distribution')
    axes[1, 0].set_xlabel('Residuals (Actual - Predicted)')
    
    # 4. SHAP Summary Plot
    try:
        explainer = shap.TreeExplainer(rf_model)
        # Calculate shap values for a sample of the test set to save time
        shap_values = explainer.shap_values(X_test.sample(100, random_state=42))
        
        plt.sca(axes[1, 1])
        shap.summary_plot(shap_values, X_test.sample(100, random_state=42), show=False)
        axes[1, 1].set_title('SHAP Summary Plot')
    except Exception as e:
        axes[1, 1].text(0.5, 0.5, f"SHAP error: {str(e)}", ha='center', va='center')
        axes[1, 1].set_title('SHAP Plot Failed')
        
    plt.tight_layout()
    plt.savefig('outputs/figures/04_ml_diagnostics.png')
    plt.close()
    
    print("04_modeling.py completed.")

if __name__ == "__main__":
    main()
