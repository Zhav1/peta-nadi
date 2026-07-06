import os
import pandas as pd
import numpy as np
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt
import seaborn as sns

def main():
    os.makedirs('outputs/tables', exist_ok=True)
    os.makedirs('outputs/figures', exist_ok=True)

    df = pd.read_parquet('data/processed/master_dataset_v2.parquet')
    
    df_prov = df.groupby('provinsi')[['korban_mengungsi', 'kemiskinan_pct']].mean().fillna(0)
    features = ['korban_mengungsi', 'kemiskinan_pct']
    X = df_prov[features]
    
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    pca = PCA()
    pca.fit(X_scaled)
    
    explained_variance = pca.explained_variance_ratio_
    
    loadings = pd.DataFrame(
        pca.components_.T,
        columns=[f'PC{i+1}' for i in range(len(features))],
        index=features
    )
    loadings.to_csv('outputs/tables/Table_3_PCA_Loadings.csv')
    
    pc1_scores = pca.transform(X_scaled)[:, 0]
    fsvi_df = pd.DataFrame({
        'provinsi': df_prov.index,
        'FSVI_Score': pc1_scores
    })
    fsvi_df = fsvi_df.sort_values(by='FSVI_Score', ascending=False)
    fsvi_df.to_csv('outputs/tables/Table_3b_FSVI_Scores.csv', index=False)
    
    # Combined Figure: Scree Plot and Bar Chart
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    
    # Scree Plot
    axes[0].plot(range(1, len(explained_variance) + 1), explained_variance, marker='o', linestyle='--', color='b')
    axes[0].set_title('PCA Scree Plot (Explained Variance)')
    axes[0].set_xlabel('Principal Component')
    axes[0].set_ylabel('Variance Ratio')
    axes[0].set_xticks([1, 2])
    
    # Bar Chart for FSVI
    sns.barplot(x='FSVI_Score', y='provinsi', data=fsvi_df.head(15), palette='viridis', ax=axes[1])
    axes[1].set_title('Top 15 Food Security Vulnerability Index (FSVI)')
    axes[1].set_xlabel('FSVI Score (PC1)')
    axes[1].set_ylabel('Province')
    
    plt.tight_layout()
    plt.savefig('outputs/figures/03_fsvi_scree_map.png')
    plt.close()

    print("03_fsvi_pca.py completed.")

if __name__ == "__main__":
    main()
