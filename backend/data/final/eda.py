"""
EDA Pipeline - MPS Educational Data
=====================================================================
Exploratory Data Analysis for 23-24 and 24-25 academic year CSVs.

Outputs (written to --out directory, default = ./eda_outputs):
  01_missing_values.png         - Heatmap of nulls per column
  02_target_distribution.png    - MPS score distribution per year + combined
  03_subject_distributions.png  - Subject avg boxplots by year
  04_score_histograms.png       - Histogram grid for all numeric cols
  05_correlation_heatmap.png    - Pearson correlation (post-aggregation)
  06_pairplot_subjects.png      - Pairplot of subject avgs colored by year
  07_mps_by_gender.png          - MPS distribution by gender
  08_mps_by_mother_tongue.png   - MPS distribution by mother tongue
  09_outlier_boxplots.png       - Outlier detection per subject avg
  10_year_comparison.png        - Side-by-side mean score comparison
  11_pass_fail_breakdown.png    - Pass/fail rate per year and subject
  12_age_vs_mps.png             - Age vs MPS scatter
  eda_summary.txt               - Full numeric summary report

Usage:
  python eda.py
  python eda.py --csv1 23-24.csv --csv2 24-25.csv --out ./eda_outputs
  python eda.py --threshold 75
"""

import os
import sys
import argparse
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.colors import TwoSlopeNorm
import seaborn as sns
from scipy.stats import ttest_ind, shapiro, skew, kurtosis


# ============================================================
# CONSTANTS
# ============================================================
TARGET     = "MPS"
DROP_COLS  = ["learnerID", "School"]
PASS_THRESHOLD = 75

MOTHER_TONGUE_MAP = {
    "Filipino": "Tagalog",
    "Iloko":    "Ilocano",
}

SUBJECT_AGGREGATE_MAP = {
    "Filipino_avg": ["Filipino 1","Filipino 2","Filipino 3","Filipino 4","Filipino 5"],
    "English_avg":  ["English 1", "English 2", "English 3", "English 4", "English 5"],
    "Math_avg":     ["Math 1",    "Math 2",    "Math 3",    "Math 4",    "Math 5"],
    "AralPan_avg":  ["Aral Pan 1","Aral Pan 2","Aral Pan 3","Aral Pan 4","Aral Pan 5"],
    "Science_avg":  ["Science 3", "Science 4", "Science 5"],
}

SUBJECT_AVG_COLS = list(SUBJECT_AGGREGATE_MAP.keys())

YEAR_LABELS = {0: "23-24", 1: "24-25"}

# ============================================================
# PALETTE
# ============================================================

BG      = "#f7f9fc"   # page background
PANEL   = "#ffffff"   # card/plot background

ACCENT  = "#4da6ff"   # sky blue
ACCENT2 = "#ff6b6b"   # light red

C23     = "#4da6ff"   # 23-24
C24     = "#ff6b6b"   # 24-25

TEXT    = "#1f2937"   # dark gray text
SUBTEXT = "#6b7280"   # muted gray
GRID    = "#e5e7eb"   # light gridlines

PASS_C  = "#34c759"   # green (kept for semantic clarity)
FAIL_C  = ACCENT2     # light red

plt.rcParams.update({
    "figure.facecolor": BG,
    "axes.facecolor":   PANEL,
    "axes.edgecolor":   GRID,
    "axes.labelcolor":  TEXT,
    "xtick.color":      SUBTEXT,
    "ytick.color":      SUBTEXT,
    "text.color":       TEXT,
    "grid.color":       GRID,
    "font.family":      "monospace",
    "axes.titlesize":   12,
    "axes.labelsize":   10,
    "legend.framealpha": 0.2,
    "legend.edgecolor":  GRID,
})

YEAR_COLORS = [C23, C24]


# ============================================================
# PREPROCESSING  (mirrors pipeline.py exactly)
# ============================================================

def normalize_dtypes(df):
    df = df.copy()
    prefixes = ("Filipino", "English", "Math", "Aral Pan", "Science", "Age")
    for col in df.columns:
        if any(col.startswith(p) for p in prefixes):
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def apply_mother_tongue_map(df):
    if "Mother Tongue" in df.columns:
        df = df.copy()
        df["Mother Tongue"] = df["Mother Tongue"].replace(MOTHER_TONGUE_MAP)
    return df


def aggregate_subject_grades(df):
    df = df.copy()
    to_drop = []
    for new_col, src_cols in SUBJECT_AGGREGATE_MAP.items():
        present = [c for c in src_cols if c in df.columns]
        if not present:
            continue
        df[new_col] = df[present].apply(pd.to_numeric, errors="coerce").mean(axis=1)
        to_drop.extend(present)
    return df.drop(columns=to_drop, errors="ignore")


def load_and_prep(csv1, csv2):
    datasets = {}
    for label, path in [("23-24", csv1), ("24-25", csv2)]:
        try:
            df = pd.read_csv(path)
            df["school_year_label"] = label
            df["school_year"] = 0 if label == "23-24" else 1
            datasets[label] = df
            print(f"  Loaded {label}: {len(df)} rows x {len(df.columns)} cols")
        except FileNotFoundError:
            print(f"  ! {path} not found - skipping {label}")

    if not datasets:
        sys.exit("ERROR: No CSVs found.")

    frames = []
    for label, df in datasets.items():
        df = df.drop(columns=DROP_COLS, errors="ignore")
        df = normalize_dtypes(df)
        df = apply_mother_tongue_map(df)
        df = aggregate_subject_grades(df)
        frames.append(df)

    combined = pd.concat(frames, ignore_index=True)
    print(f"  Combined: {len(combined)} rows x {combined.shape[1]} cols")
    return combined, datasets, frames


# ============================================================
# HELPERS
# ============================================================

def save(fig, path, tight=True):
    if tight:
        fig.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print(f"  OK  {os.path.basename(path)}")


def ax_style(ax, title=None, xlabel=None, ylabel=None):
    ax.set_facecolor(PANEL)
    ax.tick_params(colors=SUBTEXT, labelsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor(GRID)
    if title:   ax.set_title(title, color=TEXT, fontsize=11, pad=8)
    if xlabel:  ax.set_xlabel(xlabel, color=TEXT, fontsize=9)
    if ylabel:  ax.set_ylabel(ylabel, color=TEXT, fontsize=9)
    ax.grid(True, color=GRID, linewidth=0.5, alpha=0.6)
    ax.set_axisbelow(True)


def section(title):
    bar = "=" * 60
    print(f"\n{bar}\n  {title}\n{bar}")


# ============================================================
# PLOT 01 - MISSING VALUES
# ============================================================

def plot_missing(df, out_path):
    miss = df.isnull().mean() * 100
    miss = miss[miss > 0].sort_values(ascending=False)

    if miss.empty:
        print("  No missing values found - skipping plot 01.")
        # still write a blank placeholder so numbering stays consistent
        fig, ax = plt.subplots(figsize=(8, 3))
        fig.patch.set_facecolor(BG)
        ax_style(ax, title="Missing Values - None Found")
        ax.text(0.5, 0.5, "No missing values in dataset",
                transform=ax.transAxes, ha="center", va="center",
                color=SUBTEXT, fontsize=13)
        save(fig, out_path)
        return miss

    fig, axes = plt.subplots(1, 2, figsize=(14, max(4, len(miss) * 0.35 + 2)))
    fig.patch.set_facecolor(BG)

    # Bar chart
    ax = axes[0]
    colors = [ACCENT2 if v > 20 else ACCENT for v in miss.values]
    ax.barh(miss.index[::-1], miss.values[::-1], color=colors[::-1],
            height=0.6, edgecolor="none")
    for i, v in enumerate(miss.values[::-1]):
        ax.text(v + 0.3, i, f"{v:.1f}%", va="center", fontsize=8, color=TEXT)
    ax_style(ax, title="Missing Values per Column (%)",
             xlabel="Missing (%)", ylabel="Column")
    ax.axvline(5,  color="#f5a623", linewidth=1, linestyle="--", alpha=0.7)
    ax.axvline(20, color=ACCENT2,   linewidth=1, linestyle="--", alpha=0.7)

    # Heatmap of nulls across rows sample
    ax2 = axes[1]
    sample = df[miss.index].isnull().astype(int)
    if len(sample) > 200:
        sample = sample.sample(200, random_state=42)
    sns.heatmap(sample.T, ax=ax2, cmap=["#1a1d27", ACCENT2],
                cbar=False, yticklabels=True, xticklabels=False,
                linewidths=0, linecolor=BG)
    ax2.set_title("Null Pattern (sample of 200 rows)", color=TEXT, fontsize=11)
    ax2.tick_params(labelsize=8, colors=SUBTEXT)

    save(fig, out_path)
    return miss


# ============================================================
# PLOT 02 - TARGET DISTRIBUTION
# ============================================================

def plot_target_dist(df, out_path, threshold):
    fig, axes = plt.subplots(1, 3, figsize=(16, 5))
    fig.patch.set_facecolor(BG)
    fig.suptitle(f"MPS Score Distribution  (pass threshold = {threshold})",
                 color=TEXT, fontsize=13, y=1.02)

    years = sorted(df["school_year"].unique())
    panels = [(years[0], C23), (years[1], C24)] if len(years) == 2 else [(years[0], ACCENT)]
    panels.append(("all", ACCENT))

    for idx, (yr, color) in enumerate(panels):
        ax = axes[idx]
        subset = df[TARGET].dropna() if yr == "all" else df[df["school_year"] == yr][TARGET].dropna()
        label  = YEAR_LABELS.get(yr, "Combined") if yr != "all" else "Combined"

        ax.hist(subset, bins=25, color=color, alpha=0.85, edgecolor=BG, linewidth=0.4)
        ax.axvline(threshold,          color=PASS_C, linewidth=1.5, linestyle="--")
        ax.axvline(subset.mean(),      color="white",linewidth=1.2, linestyle=":")
        ax.axvline(subset.median(),    color=ACCENT2,linewidth=1.2, linestyle=":")

        pass_rate = (subset >= threshold).mean() * 100
        ax.text(0.97, 0.97,
                f"n={len(subset)}\nmean={subset.mean():.1f}\nmed={subset.median():.1f}\npass={pass_rate:.1f}%",
                transform=ax.transAxes, va="top", ha="right",
                fontsize=8, color=TEXT,
                bbox=dict(boxstyle="round,pad=0.3", facecolor=PANEL,
                          edgecolor=GRID, alpha=0.9))

        ax_style(ax, title=label, xlabel="MPS Score", ylabel="Count")

    save(fig, out_path)


# ============================================================
# PLOT 03 - SUBJECT DISTRIBUTIONS BY YEAR
# ============================================================

def plot_subject_dist(df, out_path):
    subj_present = [c for c in SUBJECT_AVG_COLS if c in df.columns]
    if not subj_present:
        print("  No subject avg cols found - skipping plot 03.")
        return

    fig, axes = plt.subplots(1, len(subj_present),
                             figsize=(len(subj_present) * 3.2, 6))
    fig.patch.set_facecolor(BG)
    fig.suptitle("Subject Average Scores by Academic Year",
                 color=TEXT, fontsize=13, y=1.02)

    if len(subj_present) == 1:
        axes = [axes]

    years = sorted(df["school_year"].unique())

    for ax, col in zip(axes, subj_present):
        data  = [df[df["school_year"] == yr][col].dropna().values for yr in years]
        labels = [YEAR_LABELS.get(yr, str(yr)) for yr in years]
        colors = YEAR_COLORS[:len(years)]

        bp = ax.boxplot(data, patch_artist=True, widths=0.5,
                        medianprops=dict(color="white", linewidth=1.5),
                        whiskerprops=dict(color=SUBTEXT),
                        capprops=dict(color=SUBTEXT),
                        flierprops=dict(marker="o", markersize=3,
                                        markerfacecolor=ACCENT2, alpha=0.5,
                                        linestyle="none"))
        for patch, color in zip(bp["boxes"], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.75)

        ax.set_xticklabels(labels, fontsize=8, color=SUBTEXT)
        name = col.replace("_avg", "")
        ax_style(ax, title=name, ylabel="Score" if ax == axes[0] else "")

        # annotate means
        for i, (d, color) in enumerate(zip(data, colors)):
            if len(d):
                ax.text(i + 1, np.mean(d) + 0.5, f"{np.mean(d):.1f}",
                        ha="center", fontsize=7, color=color)

    save(fig, out_path)


# ============================================================
# PLOT 04 - SCORE HISTOGRAMS GRID
# ============================================================

def plot_histograms(df, out_path):
    num_cols = df.select_dtypes(include=np.number).columns.tolist()
    num_cols = [c for c in num_cols if c not in ("school_year",)]
    n = len(num_cols)
    if n == 0:
        return

    ncols = min(4, n)
    nrows = (n + ncols - 1) // ncols
    fig, axes = plt.subplots(nrows, ncols, figsize=(ncols * 4, nrows * 3))
    fig.patch.set_facecolor(BG)
    fig.suptitle("Numeric Feature Distributions", color=TEXT, fontsize=13)

    axes_flat = np.array(axes).flatten()
    years = sorted(df["school_year"].unique())

    for i, col in enumerate(num_cols):
        ax = axes_flat[i]
        for yr, color in zip(years, YEAR_COLORS):
            subset = df[df["school_year"] == yr][col].dropna()
            ax.hist(subset, bins=20, alpha=0.6, color=color,
                    label=YEAR_LABELS.get(yr, str(yr)), edgecolor="none")
        ax_style(ax, title=col, xlabel="", ylabel="")
        ax.legend(fontsize=7, labelcolor=TEXT)

    for j in range(i + 1, len(axes_flat)):
        axes_flat[j].set_visible(False)

    save(fig, out_path)


# ============================================================
# PLOT 05 - CORRELATION HEATMAP
# ============================================================

def plot_correlation(df, out_path):
    num_df = df.select_dtypes(include=np.number).drop(columns=["school_year"], errors="ignore")
    corr   = num_df.corr()
    n      = len(corr)

    fig, ax = plt.subplots(figsize=(max(8, n * 0.7), max(6, n * 0.65)))
    fig.patch.set_facecolor(BG)

    norm_c = TwoSlopeNorm(vmin=-1, vcenter=0, vmax=1)
    cmap   = sns.diverging_palette(250, 10, s=80, l=45, as_cmap=True)
    mask   = np.triu(np.ones_like(corr, dtype=bool), k=1)

    sns.heatmap(corr, ax=ax, mask=mask, cmap=cmap, norm=norm_c,
                annot=(n <= 15), fmt=".2f",
                annot_kws={"size": 8, "color": TEXT},
                linewidths=0.4, linecolor=BG, square=True,
                cbar_kws={"shrink": 0.7, "label": "Pearson r"})

    ax.set_title("Feature Correlation Matrix (post-aggregation)",
                 color=TEXT, fontsize=13, pad=12, fontweight="bold")
    ax.tick_params(axis="x", rotation=45, labelsize=8)
    ax.tick_params(axis="y", rotation=0,  labelsize=8)

    cbar = ax.collections[0].colorbar
    cbar.ax.yaxis.set_tick_params(color=SUBTEXT, labelcolor=SUBTEXT)
    cbar.outline.set_edgecolor(GRID)

    save(fig, out_path)
    return corr


# ============================================================
# PLOT 06 - PAIRPLOT SUBJECTS
# ============================================================

def plot_pairplot(df, out_path):
    subj_present = [c for c in SUBJECT_AVG_COLS if c in df.columns]
    if len(subj_present) < 2:
        print("  Not enough subject cols for pairplot - skipping.")
        return

    plot_df = df[subj_present + ["school_year"]].dropna().copy()
    plot_df["Year"] = plot_df["school_year"].map(YEAR_LABELS)

    palette = {v: c for v, c in zip(YEAR_LABELS.values(), YEAR_COLORS)}

    with plt.rc_context({"figure.facecolor": BG, "axes.facecolor": PANEL}):
        g = sns.pairplot(
            plot_df.drop(columns=["school_year"]),
            hue="Year",
            palette=palette,
            diag_kind="kde",
            plot_kws={"alpha": 0.4, "s": 15, "edgecolor": "none"},
            diag_kws={"fill": True, "alpha": 0.5},
        )
        g.figure.patch.set_facecolor(BG)
        for ax in g.axes.flatten():
            if ax:
                ax.set_facecolor(PANEL)
                for spine in ax.spines.values():
                    spine.set_edgecolor(GRID)
                ax.tick_params(colors=SUBTEXT, labelsize=7)
                ax.xaxis.label.set_color(TEXT)
                ax.yaxis.label.set_color(TEXT)

        g.figure.suptitle("Subject Avg Pairplot by Academic Year",
                           color=TEXT, y=1.01, fontsize=13)
        g.legend.get_frame().set_facecolor(PANEL)
        for text in g.legend.get_texts():
            text.set_color(TEXT)

        g.figure.savefig(out_path, dpi=130, bbox_inches="tight", facecolor=BG)
        plt.close(g.figure)
    print(f"  OK  {os.path.basename(out_path)}")


# ============================================================
# PLOT 07 - MPS BY GENDER
# ============================================================

def plot_by_gender(df, out_path, threshold):
    if "Sex" not in df.columns or TARGET not in df.columns:
        print("  No Gender or MPS col - skipping plot 07.")
        return

    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    fig.patch.set_facecolor(BG)
    fig.suptitle("MPS Score by Gender", color=TEXT, fontsize=13)

    genders = sorted(df["Sex"].dropna().unique())
    years   = sorted(df["school_year"].unique())
    g_colors = [ACCENT, "#4cd964", "#f5a623", ACCENT2]

    # Violin per gender
    ax = axes[0]
    data   = [df[df["Sex"] == g][TARGET].dropna().values for g in genders]
    colors = g_colors[:len(genders)]
    vp = ax.violinplot(data, positions=range(len(genders)),
                       showmedians=True, showextrema=False)
    for body, color in zip(vp["bodies"], colors):
        body.set_facecolor(color)
        body.set_alpha(0.7)
    vp["cmedians"].set_color("white")
    ax.set_xticks(range(len(genders)))
    ax.set_xticklabels(genders, color=SUBTEXT, fontsize=9)
    ax.axhline(threshold, color=PASS_C, linewidth=1, linestyle="--", alpha=0.7)
    ax_style(ax, title="Score Distribution by Gender", ylabel="MPS")

    # Pass rate per gender per year
    ax2 = axes[1]
    x    = np.arange(len(genders))
    w    = 0.35
    for i, (yr, color) in enumerate(zip(years, YEAR_COLORS)):
        rates = []
        for g in genders:
            sub = df[(df["Sex"] == g) & (df["school_year"] == yr)][TARGET].dropna()
            rates.append((sub >= threshold).mean() * 100 if len(sub) else 0)
        bars = ax2.bar(x + (i - 0.5) * w, rates, width=w, color=color,
                       alpha=0.8, label=YEAR_LABELS.get(yr, str(yr)),
                       edgecolor="none")
        for bar, rate in zip(bars, rates):
            ax2.text(bar.get_x() + bar.get_width() / 2,
                     bar.get_height() + 0.5,
                     f"{rate:.0f}%", ha="center", fontsize=8, color=TEXT)

    ax2.set_xticks(x)
    ax2.set_xticklabels(genders, color=SUBTEXT)
    ax2.set_ylim(0, 115)
    ax2.legend(labelcolor=TEXT, fontsize=9)
    ax_style(ax2, title=f"Pass Rate (>={threshold}) by Gender & Year",
             ylabel="Pass Rate (%)")

    save(fig, out_path)


# ============================================================
# PLOT 08 - MPS BY MOTHER TONGUE
# ============================================================

def plot_by_mother_tongue(df, out_path, threshold):
    if "Mother Tongue" not in df.columns or TARGET not in df.columns:
        print("  No Mother Tongue col - skipping plot 08.")
        return

    mt_order = (df.groupby("Mother Tongue")[TARGET].mean()
                  .sort_values(ascending=False).index.tolist())

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    fig.patch.set_facecolor(BG)
    fig.suptitle("MPS Score by Mother Tongue", color=TEXT, fontsize=13)

    palette = sns.color_palette("husl", len(mt_order))

    # Boxplot
    ax = axes[0]
    bp_data = [df[df["Mother Tongue"] == mt][TARGET].dropna().values for mt in mt_order]
    bp = ax.boxplot(bp_data, patch_artist=True, widths=0.55,
                    medianprops=dict(color="white", linewidth=1.5),
                    whiskerprops=dict(color=SUBTEXT),
                    capprops=dict(color=SUBTEXT),
                    flierprops=dict(marker="o", markersize=3,
                                    markerfacecolor=ACCENT2, alpha=0.4,
                                    linestyle="none"))
    for patch, color in zip(bp["boxes"], palette):
        patch.set_facecolor(color)
        patch.set_alpha(0.75)
    ax.set_xticklabels(mt_order, rotation=30, ha="right", fontsize=8, color=SUBTEXT)
    ax.axhline(threshold, color=PASS_C, linewidth=1, linestyle="--", alpha=0.7)
    ax_style(ax, title="Score Distribution", ylabel="MPS")

    # Count + pass rate bar
    ax2 = axes[1]
    counts = [len(df[df["Mother Tongue"] == mt][TARGET].dropna()) for mt in mt_order]
    rates  = [(df[df["Mother Tongue"] == mt][TARGET].dropna() >= threshold).mean() * 100
              for mt in mt_order]
    x = np.arange(len(mt_order))
    bars = ax2.bar(x, rates, color=[c for c in palette], alpha=0.8, edgecolor="none")
    for bar, n, r in zip(bars, counts, rates):
        ax2.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                 f"{r:.0f}%\nn={n}", ha="center", fontsize=7, color=TEXT)
    ax2.set_xticks(x)
    ax2.set_xticklabels(mt_order, rotation=30, ha="right", fontsize=8, color=SUBTEXT)
    ax2.set_ylim(0, 120)
    ax_style(ax2, title=f"Pass Rate (>={threshold}) by Mother Tongue",
             ylabel="Pass Rate (%)")

    save(fig, out_path)


# ============================================================
# PLOT 09 - OUTLIER BOXPLOTS
# ============================================================

def plot_outliers(df, out_path):
    num_cols = [c for c in df.select_dtypes(include=np.number).columns
                if c not in ("school_year",)]
    if not num_cols:
        return

    ncols = min(4, len(num_cols))
    nrows = (len(num_cols) + ncols - 1) // ncols
    fig, axes = plt.subplots(nrows, ncols, figsize=(ncols * 3.5, nrows * 3.5))
    fig.patch.set_facecolor(BG)
    fig.suptitle("Outlier Detection per Feature (IQR method)",
                 color=TEXT, fontsize=13)

    axes_flat = np.array(axes).flatten()
    years = sorted(df["school_year"].unique())

    for i, col in enumerate(num_cols):
        ax = axes_flat[i]
        data = [df[df["school_year"] == yr][col].dropna().values for yr in years]
        labels = [YEAR_LABELS.get(yr, str(yr)) for yr in years]

        bp = ax.boxplot(data, patch_artist=True, widths=0.5,
                        medianprops=dict(color="white", linewidth=1.5),
                        whiskerprops=dict(color=SUBTEXT),
                        capprops=dict(color=SUBTEXT),
                        flierprops=dict(marker="o", markersize=4,
                                        markerfacecolor=ACCENT2, alpha=0.6,
                                        linestyle="none"))
        for patch, color in zip(bp["boxes"], YEAR_COLORS):
            patch.set_facecolor(color)
            patch.set_alpha(0.7)

        # Count outliers per year (IQR)
        outlier_info = []
        for d in data:
            if len(d) == 0:
                outlier_info.append("n=0")
                continue
            q1, q3 = np.percentile(d, 25), np.percentile(d, 75)
            iqr     = q3 - q1
            n_out   = int(np.sum((d < q1 - 1.5 * iqr) | (d > q3 + 1.5 * iqr)))
            outlier_info.append(f"{n_out} out")

        ax.set_xticklabels(
            [f"{l}\n{o}" for l, o in zip(labels, outlier_info)],
            fontsize=7, color=SUBTEXT
        )
        ax_style(ax, title=col)

    for j in range(i + 1, len(axes_flat)):
        axes_flat[j].set_visible(False)

    save(fig, out_path)


# ============================================================
# PLOT 10 - YEAR COMPARISON BAR
# ============================================================

def plot_year_comparison(df, out_path):
    num_cols = [c for c in df.select_dtypes(include=np.number).columns
                if c not in ("school_year",)]
    if not num_cols:
        return

    years = sorted(df["school_year"].unique())
    if len(years) < 2:
        print("  Only one year - skipping year comparison plot.")
        return

    means = {YEAR_LABELS[yr]: df[df["school_year"] == yr][num_cols].mean()
             for yr in years}
    means_df = pd.DataFrame(means)

    fig, ax = plt.subplots(figsize=(max(10, len(num_cols) * 0.8), 6))
    fig.patch.set_facecolor(BG)

    x = np.arange(len(num_cols))
    w = 0.35
    for i, (label, color) in enumerate(zip(means_df.columns, YEAR_COLORS)):
        bars = ax.bar(x + (i - 0.5) * w, means_df[label].values,
                      width=w, color=color, alpha=0.85,
                      label=label, edgecolor="none")
        for bar, val in zip(bars, means_df[label].values):
            ax.text(bar.get_x() + bar.get_width() / 2,
                    bar.get_height() + 0.2,
                    f"{val:.1f}", ha="center", fontsize=7, color=TEXT)

    ax.set_xticks(x)
    ax.set_xticklabels(num_cols, rotation=35, ha="right", fontsize=8, color=SUBTEXT)
    ax.legend(labelcolor=TEXT, fontsize=9)
    ax_style(ax, title="Mean Score per Feature by Academic Year",
             ylabel="Mean Score")

    # Annotate delta
    for i, col in enumerate(num_cols):
        v0 = means_df.iloc[i, 0]
        v1 = means_df.iloc[i, 1]
        delta = v1 - v0
        color = PASS_C if delta >= 0 else ACCENT2
        ax.text(i, max(v0, v1) + 1.5, f"{delta:+.1f}",
                ha="center", fontsize=7, color=color, fontweight="bold")

    save(fig, out_path)


# ============================================================
# PLOT 11 - PASS/FAIL BREAKDOWN
# ============================================================

def plot_pass_fail(df, out_path, threshold):
    subj_present = [c for c in SUBJECT_AVG_COLS if c in df.columns]
    cols = (subj_present + [TARGET]) if TARGET in df.columns else subj_present
    if not cols:
        return

    years  = sorted(df["school_year"].unique())
    n_cols = len(cols)

    fig, axes = plt.subplots(len(years), n_cols,
                             figsize=(n_cols * 2.8, len(years) * 3.5))
    fig.patch.set_facecolor(BG)
    fig.suptitle(f"Pass / Fail Breakdown by Subject & Year  (threshold = {threshold})",
                 color=TEXT, fontsize=13)

    if len(years) == 1:
        axes = [axes]

    for row, yr in enumerate(years):
        sub_df = df[df["school_year"] == yr]
        row_axes = axes[row] if n_cols > 1 else [axes[row]]
        for ax, col in zip(row_axes, cols):
            vals   = sub_df[col].dropna()
            passed = (vals >= threshold).sum()
            failed = len(vals) - passed
            total  = len(vals)

            wedges, texts, autotexts = ax.pie(
                [passed, failed],
                labels=["Pass", "Fail"],
                colors=[PASS_C, FAIL_C],
                autopct="%1.1f%%",
                startangle=90,
                wedgeprops=dict(edgecolor=BG, linewidth=1.5),
                textprops=dict(color=TEXT, fontsize=8),
            )
            for at in autotexts:
                at.set_fontsize(8)
                at.set_color(BG)

            year_lbl = YEAR_LABELS.get(yr, str(yr))
            name     = col.replace("_avg", "")
            ax.set_title(f"{year_lbl}\n{name}\n(n={total})",
                         color=TEXT, fontsize=8, pad=4)

    save(fig, out_path, tight=False)


# ============================================================
# PLOT 12 - AGE vs MPS SCATTER
# ============================================================

def plot_age_vs_mps(df, out_path):
    if "Age" not in df.columns or TARGET not in df.columns:
        print("  No Age col - skipping plot 12.")
        return

    fig, ax = plt.subplots(figsize=(10, 6))
    fig.patch.set_facecolor(BG)

    years = sorted(df["school_year"].unique())
    for yr, color in zip(years, YEAR_COLORS):
        sub = df[df["school_year"] == yr][["Age", TARGET]].dropna()
        ax.scatter(sub["Age"] + np.random.uniform(-0.2, 0.2, len(sub)),
                   sub[TARGET],
                   color=color, alpha=0.4, s=20, edgecolor="none",
                   label=YEAR_LABELS.get(yr, str(yr)))

        # Mean MPS per age
        age_mean = sub.groupby("Age")[TARGET].mean()
        ax.plot(age_mean.index, age_mean.values,
                color=color, linewidth=2, marker="o", markersize=5)

    ax_style(ax, title="Age vs MPS Score", xlabel="Age", ylabel="MPS Score")
    ax.legend(labelcolor=TEXT, fontsize=9)

    save(fig, out_path)


# ============================================================
# SUMMARY REPORT
# ============================================================

def write_summary(df, frames, corr, miss, threshold, out_path):
    W = 65
    lines = [
        "=" * W,
        "  EDA SUMMARY REPORT - MPS EDUCATIONAL DATA",
        "=" * W,
    ]

    # Dataset overview
    lines += [
        "\nDATASET OVERVIEW",
        "-" * W,
        f"  Total records      : {len(df)}",
        f"  Total columns      : {df.shape[1]}",
    ]
    for i, (frame, label) in enumerate(zip(frames, ["23-24", "24-25"])):
        lines.append(f"  {label}               : {len(frame)} records")

    # Target stats
    if TARGET in df.columns:
        t = df[TARGET].dropna()
        lines += [
            f"\nTARGET: {TARGET}",
            "-" * W,
            f"  Count   : {len(t)}",
            f"  Mean    : {t.mean():.3f}",
            f"  Median  : {t.median():.3f}",
            f"  Std     : {t.std():.3f}",
            f"  Min/Max : {t.min():.2f} / {t.max():.2f}",
            f"  Skew    : {skew(t):.3f}",
            f"  Kurt    : {kurtosis(t):.3f}",
            f"  Pass rate (>={threshold}): {(t >= threshold).mean()*100:.1f}%",
        ]
        years = sorted(df["school_year"].unique())
        for yr in years:
            sub = df[df["school_year"] == yr][TARGET].dropna()
            lines.append(
                f"  {YEAR_LABELS.get(yr, str(yr))}: "
                f"mean={sub.mean():.2f}  std={sub.std():.2f}  "
                f"pass={((sub >= threshold).mean()*100):.1f}%  n={len(sub)}"
            )

    # Per-subject stats
    subj_present = [c for c in SUBJECT_AVG_COLS if c in df.columns]
    if subj_present:
        lines += ["\nSUBJECT AVG STATISTICS", "-" * W,
                  f"  {'Subject':<18} {'Mean':>7} {'Std':>7} "
                  f"{'Min':>7} {'Max':>7} {'Skew':>7} {'Pass%':>7}"]
        lines.append(f"  {'-'*18} {'-------':>7} {'-------':>7} "
                     f"{'-------':>7} {'-------':>7} {'-------':>7} {'-------':>7}")
        for col in subj_present:
            s = df[col].dropna()
            pass_r = (s >= threshold).mean() * 100 if len(s) else 0
            lines.append(
                f"  {col:<18} {s.mean():>7.2f} {s.std():>7.2f} "
                f"{s.min():>7.2f} {s.max():>7.2f} {skew(s):>7.3f} {pass_r:>6.1f}%"
            )

    # Normality test
    if subj_present:
        lines += ["\nNORMALITY TEST (Shapiro-Wilk, sample=50)",
                  "-" * W,
                  f"  {'Column':<20} {'W-stat':>8} {'p-value':>10} {'Normal?'}"]
        lines.append(f"  {'-'*20} {'--------':>8} {'----------':>10} {'-------'}")
        for col in subj_present + ([TARGET] if TARGET in df.columns else []):
            s = df[col].dropna()
            sample = s.sample(min(50, len(s)), random_state=42)
            w, p = shapiro(sample)
            normal = "Yes" if p > 0.05 else "No"
            lines.append(f"  {col:<20} {w:>8.4f} {p:>10.4f} {normal}")

    # Missing values
    lines += ["\nMISSING VALUES", "-" * W]
    if miss.empty:
        lines.append("  None - dataset is complete.")
    else:
        lines.append(f"  {'Column':<25} {'Missing %':>10}")
        lines.append(f"  {'-'*25} {'----------':>10}")
        for col, pct in miss.items():
            lines.append(f"  {col:<25} {pct:>9.2f}%")

    # Correlation
    if corr is not None:
        high = [(corr.columns[i], corr.columns[j], corr.iloc[i, j])
                for i in range(len(corr))
                for j in range(i)
                if abs(corr.iloc[i, j]) >= 0.8]
        lines += [f"\nHIGH CORRELATION PAIRS (|r| >= 0.80)  - {len(high)} found",
                  "-" * W]
        if high:
            for a, b, r in sorted(high, key=lambda x: -abs(x[2])):
                lines.append(f"  {a:<22} <-> {b:<22}  r={r:+.3f}")
        else:
            lines.append("  None found.")

    # Categorical summaries
    cat_cols = df.select_dtypes(exclude=np.number).columns.tolist()
    cat_cols = [c for c in cat_cols if c not in ("school_year_label",)]
    if cat_cols:
        lines += ["\nCATEGORICAL SUMMARIES", "-" * W]
        for col in cat_cols:
            vc = df[col].value_counts()
            lines.append(f"\n  {col}  (unique={df[col].nunique()}):")
            for val, cnt in vc.items():
                pct = cnt / len(df) * 100
                lines.append(f"    {str(val):<25} {cnt:>5}  ({pct:.1f}%)")

    lines += ["", "=" * W]

    text = "\n".join(lines)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  OK  eda_summary.txt")
    print("\n" + text)


# ============================================================
# MAIN
# ============================================================

def parse_args():
    p = argparse.ArgumentParser(description="EDA Pipeline - MPS Educational Data")
    p.add_argument("--csv1",      default="23-24.csv",   help="Academic year 23-24 CSV")
    p.add_argument("--csv2",      default="24-25.csv",   help="Academic year 24-25 CSV")
    p.add_argument("--out",       default="eda_outputs", help="Output directory")
    p.add_argument("--threshold", type=float, default=75,
                   help="Pass/fail score threshold (default: 75)")
    return p.parse_args()


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    SEP = "=" * 60

    def out(fname):
        return os.path.join(args.out, fname)

    # Load
    section("LOADING & PREPROCESSING")
    combined, datasets, frames = load_and_prep(args.csv1, args.csv2)

    # Run all plots
    section("GENERATING PLOTS")

    miss = plot_missing(combined, out("01_missing_values.png"))
    plot_target_dist(combined, out("02_target_distribution.png"), args.threshold)
    plot_subject_dist(combined, out("03_subject_distributions.png"))
    plot_histograms(combined, out("04_score_histograms.png"))
    corr = plot_correlation(combined, out("05_correlation_heatmap.png"))
    plot_pairplot(combined, out("06_pairplot_subjects.png"))
    plot_by_gender(combined, out("07_mps_by_gender.png"), args.threshold)
    plot_by_mother_tongue(combined, out("08_mps_by_mother_tongue.png"), args.threshold)
    plot_outliers(combined, out("09_outlier_boxplots.png"))
    plot_year_comparison(combined, out("10_year_comparison.png"))
    plot_pass_fail(combined, out("11_pass_fail_breakdown.png"), args.threshold)
    plot_age_vs_mps(combined, out("12_age_vs_mps.png"))

    # Summary report
    section("WRITING SUMMARY REPORT")
    write_summary(combined, frames, corr, miss, args.threshold,
                  out("eda_summary.txt"))

    print(f"\n{SEP}")
    print(f"  DONE - {len(os.listdir(args.out))} files in: {os.path.abspath(args.out)}")
    print(SEP + "\n")


if __name__ == "__main__":
    main()