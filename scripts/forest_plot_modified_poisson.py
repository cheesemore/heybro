"""
Forest plot: Modified Poisson — style aligned to reference (log x-axis, red null line, p-value shapes/colors).
Run: python scripts/forest_plot_modified_poisson.py
Output: scripts/forest_plot_modified_poisson.png (or set OUT path)
"""
from __future__ import annotations

import re
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

# --- raw data (Characteristics, aRR (95% CI), P-value) ---
ROWS = [
    ("Male", "1.29 (1.08-1.54)", "0.006"),
    ("Age", "1.03 (1.03-1.04)", "<0.001"),
    ("BMI", "1.04 (1.02-1.07)", "<0.001"),
    ("GAD-7", "1.01 (0.99-1.03)", "0.324"),
    ("PHQ-9", "1.00 (0.98-1.02)", "0.882"),
    ("Chalder Fatigue Scale", "0.99 (0.97-1.02)", "0.657"),
    ("ESS", "0.98 (0.97-1.00)", "0.066"),
    ("Other Sleep Disorders*", "0.92 (0.76-1.12)", "0.406"),
    ("Total sleep time", "1.001 (0.999-1.002)", "0.375"),
    ("WASO", "1.000 (0.998-1.001)", "0.695"),
    ("Respiration-related arousal index", "1.00 (0.99-1.01)", "0.715"),
    ("N3%", "1.00 (0.99-1.01)", "0.906"),
    ("REM%", "0.99 (0.98-1.01)", "0.301"),
    ("AHI", "1.01 (1.00-1.01)", "0.185"),
    ("AI%", "0.88 (0.60-1.28)", "0.495"),
    ("Central apnea index", "1.06 (0.98-1.15)", "0.131"),
    ("Average oxygen saturation during sleep", "1.03 (0.99-1.07)", "0.139"),
    ("Minimum oxygen saturation", "0.99 (0.98-1.00)", "0.047"),
    ("Highest HR during sleep", "0.998 (0.992-1.005)", "0.616"),
]

_CI_RE = re.compile(
    r"^\s*([0-9.]+)\s*\(\s*([0-9.]+)\s*-\s*([0-9.]+)\s*\)\s*$",
    re.IGNORECASE,
)


def parse_ci(s: str) -> tuple[float, float, float]:
    m = _CI_RE.match(s.strip())
    if not m:
        raise ValueError(f"Cannot parse CI: {s!r}")
    return float(m.group(1)), float(m.group(2)), float(m.group(3))


def parse_p(s: str) -> float:
    t = s.strip().replace(" ", "")
    if t.startswith("<"):
        return float(t[1:]) * 0.5  # e.g. <0.001 → well below 0.05 for styling only
    return float(t)


def p_style(p: float) -> tuple[str, str, str]:
    """color, marker, label category"""
    if p < 0.05:
        return "#1f77b4", "s", "sig"  # blue square
    if p < 0.10:
        return "#ff7f0e", "s", "marginal"  # orange square
    return "#7f7f7f", "o", "ns"  # grey circle


def main() -> None:
    root = Path(__file__).resolve().parent
    out = root / "forest_plot_modified_poisson.png"

    labels: list[str] = []
    est: list[float] = []
    lo: list[float] = []
    hi: list[float] = []
    colors: list[str] = []
    markers: list[str] = []

    for char, ci_str, p_str in ROWS:
        labels.append(char.strip())
        e, l, h = parse_ci(ci_str)
        est.append(e)
        lo.append(l)
        hi.append(h)
        c, m, _ = p_style(parse_p(p_str))
        colors.append(c)
        markers.append(m)

    n = len(labels)
    y = np.arange(n)[::-1]  # first row at top

    fig, ax = plt.subplots(figsize=(10, 10.5), dpi=150)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    for i in range(n):
        e, l, h = est[i], lo[i], hi[i]
        xerr = np.array([[e - l], [h - e]])
        ax.errorbar(
            [e],
            [y[i]],
            xerr=xerr,
            fmt=markers[i],
            color=colors[i],
            ecolor=colors[i],
            elinewidth=1.2,
            capsize=3,
            markersize=7,
            zorder=3,
        )

    ax.axvline(1.0, color="red", linestyle="--", linewidth=1.2, zorder=1)

    ax.set_xscale("log")
    all_x = np.array(lo + hi + est, dtype=float)
    xmin = max(all_x.min() * 0.92, 0.01)
    xmax = min(all_x.max() * 1.08, 100)
    ax.set_xlim(xmin, xmax)

    ax.set_yticks(y)
    ax.set_yticklabels(labels, fontsize=9)
    ax.invert_yaxis()

    ax.set_title("Forest Plot: Modified Poisson", fontsize=12, fontweight="bold", pad=12)
    ax.set_xlabel("Adjusted Risk Ratio (95% CI)", fontsize=10)

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(False)

    # Manual tick locations similar to reference (1.0 and ~0.6); extend if data needs
    tick_lo = 0.6
    tick_hi = 1.6
    # minor log ticks feel
    ax.set_xticks([tick_lo, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, tick_hi])
    ax.get_xaxis().set_major_formatter(
        plt.FuncFormatter(lambda v, _: f"{v:g}" if abs(v - 1) > 1e-6 else "1.0")
    )

    from matplotlib.lines import Line2D

    legend_elems = [
        Line2D([0], [0], marker="s", color="w", markerfacecolor="#1f77b4", markersize=8, label=r"$P < 0.05$"),
        Line2D([0], [0], marker="s", color="w", markerfacecolor="#ff7f0e", markersize=8, label=r"$P = 0.05 - 0.10$"),
        Line2D([0], [0], marker="o", color="w", markerfacecolor="#7f7f7f", markersize=8, label=r"$P \geq 0.10$"),
    ]
    leg = ax.legend(
        handles=legend_elems,
        loc="lower right",
        frameon=True,
        fancybox=False,
        edgecolor="0.7",
        fontsize=9,
    )
    leg.get_frame().set_linewidth(0.8)

    plt.tight_layout()
    fig.savefig(out, bbox_inches="tight", facecolor="white")
    print("Saved", out)


if __name__ == "__main__":
    main()
