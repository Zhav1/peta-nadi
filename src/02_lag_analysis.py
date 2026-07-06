import pandas as pd
import numpy as np
import os
import matplotlib.pyplot as plt
from scipy.stats import pearsonr
from statsmodels.tsa.stattools import adfuller

def main():
    os.makedirs('outputs/tables', exist_ok=True)
    os.makedirs('outputs/figures', exist_ok=True)
    
    df = pd.read_parquet('data/processed/master_dataset_v2.parquet')
    
    if 'tanggal' in df.columns:
        date_col = 'tanggal'
        df[date_col] = pd.to_datetime(df[date_col])
    else:
        date_col = 'tahun_bulan'
        df[date_col] = pd.to_datetime(df[date_col])
        
    national_df = df.groupby(date_col).agg({
        'curah_hujan_mm': 'mean',
        'harga_cabai_rawit_mean': 'mean'
    }).reset_index().sort_values(date_col)
    
    # Augmented Dickey-Fuller Test for Stationarity
    def is_stationary(series):
        series = series.dropna()
        if len(series) > 10:
            result = adfuller(series)
            return result[1] < 0.05 # p-value < 0.05 means stationary
        return True
        
    ts_rain = national_df['curah_hujan_mm']
    ts_price = national_df['harga_cabai_rawit_mean']
    
    # First-order differencing if non-stationary
    if not is_stationary(ts_rain):
        national_df['curah_hujan_mm'] = national_df['curah_hujan_mm'].diff()
    if not is_stationary(ts_price):
        national_df['harga_cabai_rawit_mean'] = national_df['harga_cabai_rawit_mean'].diff()
        
    national_df = national_df.dropna()
    
    # Cross-Correlation Function (CCF)
    results = []
    lags = list(range(0, 7))
    
    for lag in lags:
        national_df[f'curah_hujan_lag_{lag}'] = national_df['curah_hujan_mm'].shift(lag)
        valid_data = national_df[['harga_cabai_rawit_mean', f'curah_hujan_lag_{lag}']].dropna()
        
        if len(valid_data) > 2:
            r, p_val = pearsonr(valid_data[f'curah_hujan_lag_{lag}'], valid_data['harga_cabai_rawit_mean'])
        else:
            r, p_val = np.nan, np.nan
            
        results.append({
            'Lag': lag,
            'Correlation': r,
            'P_Value': p_val,
            'Significant': p_val < 0.05 if pd.notnull(p_val) else False
        })
        
    ccf_df = pd.DataFrame(results)
    ccf_df.to_csv('outputs/tables/Table_2_CCF_Significance.csv', index=False)
    
    plt.figure(figsize=(8, 5))
    colors = ['red' if p >= 0.05 else 'green' for p in ccf_df['P_Value']]
    plt.bar(ccf_df['Lag'], ccf_df['Correlation'], color=colors)
    plt.axhline(0, color='black', linewidth=1)
    plt.title('CCF: Curah Hujan vs Harga Cabai Rawit (Post-Differencing)')
    plt.xlabel('Lag (Bulan)')
    plt.ylabel('Korelasi (Pearson r)')
    plt.xticks(lags)
    plt.tight_layout()
    plt.savefig('outputs/figures/02_ccf_plot.png')
    
    print("02_lag_analysis.py completed.")

if __name__ == "__main__":
    main()
