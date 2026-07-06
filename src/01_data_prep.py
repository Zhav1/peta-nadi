import pandas as pd
import numpy as np
import os
import matplotlib.pyplot as plt
import seaborn as sns

def main():
    os.makedirs('outputs/tables', exist_ok=True)
    os.makedirs('outputs/figures', exist_ok=True)
    
    # 1. Load data
    df = pd.read_parquet('data/processed/master_dataset_v2.parquet')
    
    food_price_cols = [
        'harga_beras_mean', 'harga_cabai_merah_mean', 'harga_cabai_rawit_mean',
        'harga_bawang_merah_mean', 'harga_bawang_putih_mean', 
        'harga_minyak_goreng_mean', 'harga_telur_ayam_mean'
    ]
    food_price_cols = [col for col in food_price_cols if col in df.columns]
    
    missing_vals = df.isnull().sum()
    
    # 2. Interpolation and Comparison Plot (Before vs After Spline)
    # Using harga_cabai_merah_mean as it has the most missing values
    target_col = 'harga_cabai_merah_mean'
    before_interp = df[target_col].copy()
    
    # Apply spline interpolation (order 3)
    df[target_col] = df[target_col].interpolate(method='spline', order=3, limit_direction='both')
    
    # Plot Before/After Comparison
    plt.figure(figsize=(12, 5))
    plt.plot(df.index, before_interp, label='Original (with gaps)', alpha=0.5, color='red', marker='x')
    plt.plot(df.index, df[target_col], label='Spline Interpolated', alpha=0.8, color='blue')
    plt.title('Before vs After Spline Interpolation: Cabai Merah')
    plt.legend()
    plt.savefig('outputs/figures/01_spline_comparison.png')
    plt.close()
    
    # 3. EDA: Histogram, Boxplot, Trend
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    
    # Histogram (Beras)
    sns.histplot(df['harga_beras_mean'], kde=True, ax=axes[0], color='green')
    axes[0].set_title('Distribusi Harga Beras')
    
    # Boxplot (All commodities) to show outliers
    sns.boxplot(data=df[food_price_cols], ax=axes[1], orient='h')
    axes[1].set_title('Deteksi Outliers Harga Pangan (Boxplot)')
    
    # Trend (Time Series) for Cabai Rawit
    if 'tanggal' in df.columns:
        date_col = 'tanggal'
        df[date_col] = pd.to_datetime(df[date_col])
    else:
        date_col = 'tahun_bulan'
        df[date_col] = pd.to_datetime(df[date_col])
        
    df_trend = df.groupby(date_col)[['harga_cabai_rawit_mean']].mean()
    df_trend.plot(ax=axes[2], color='red')
    axes[2].set_title('Tren Time-Series Harga Cabai Rawit')
    
    plt.tight_layout()
    plt.savefig('outputs/figures/01_eda_plots.png')
    plt.close()
    
    # 4. Pearson Correlation Heatmap
    corr_cols = ['curah_hujan_mm', 'korban_mengungsi', 'kemiskinan_pct', 'harga_beras_mean', 'harga_cabai_rawit_mean']
    corr_cols = [c for c in corr_cols if c in df.columns]
    
    corr_matrix = df[corr_cols].corr(method='pearson')
    plt.figure(figsize=(8, 6))
    sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', fmt=".2f")
    plt.title('Pearson Correlation Heatmap')
    plt.tight_layout()
    plt.savefig('outputs/figures/01_pearson_heatmap.png')
    plt.close()

    # 5. Outliers (IQR) and CV Calculation
    outliers_info = {}
    cv_info = {}
    
    for col in food_price_cols:
        Q1 = df[col].quantile(0.25)
        Q3 = df[col].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        outliers = df[(df[col] < lower_bound) | (df[col] > upper_bound)]
        outliers_info[col] = len(outliers)
        
        mean_val = df[col].mean()
        std_val = df[col].std()
        cv_info[col] = (std_val / mean_val) * 100 if mean_val != 0 else np.nan
        
    data_quality_df = pd.DataFrame({
        'Missing_Values': missing_vals[food_price_cols],
        'Outliers_Count': [outliers_info[col] for col in food_price_cols],
        'CV_Percentage': [cv_info[col] for col in food_price_cols]
    })
    
    data_quality_df.to_csv('outputs/tables/Table_1_Data_Quality.csv')
    
    print("01_data_prep.py completed.")

if __name__ == "__main__":
    main()
