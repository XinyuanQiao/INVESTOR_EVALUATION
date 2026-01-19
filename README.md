# 投资群季度奖惩与资金支配规则（Calmar）计算器

一个**纯静态网页**的小工具：输入每个人的当季 `R/MDD/Leverage` 与本年度已累计贡献 `YTD_Contrib`，自动计算 `P / Contrib / Credit / Net`。

## 关键口径（已按你的规则写死）

- **n 已调整为 6**：因此 `PotTarget = 60 × n = 360`。
- **季度计算**：当季 `R / MDD` → `P`（含稳健标准化的 `median/MAD`）。
- **年度计算（仅用于封顶）**：`CAP_Y=500`，每人需输入本年度已累计贡献 `YTD_Contrib`，用于 `CAP_Y_REMAIN = 500 - YTD_Contrib` 的封顶。
- **杠杆硬规则**：当季 `Leverage > 2.0` → `Credit = 0`，且 `Contrib = min(100, CAP_Y_REMAIN)`（仍参与评分口径）。
- **金额取整**：`Contrib` 与 `Credit` 四舍五入到整数 AUD。`Credit` 使用“整数分配法”保证 `sum(Credit) = Pot`。

## 使用方式

直接打开 `index.html`，按表格填写后点 **计算**。

输入提示：
- `R` 和 `MDD` 用小数输入（例如 6% 写 `0.06`）。
- `YTD_Contrib` 是从你设定的“本年度起始日期”到上季末的累计贡献（AUD，整数或小数均可）。

## GitHub Pages（零成本公开访问）

### 方式 A：GitHub Actions 自动部署（推荐）

> 仓库已包含 `.github/workflows/pages.yml`，以后每次 push 到 `main` 会自动发布。

1. 推送到 GitHub 仓库默认分支（通常是 `main`）。
2. 打开仓库：`Settings → Pages`。
3. `Build and deployment` 选择：
   - `Source`: `GitHub Actions`
4. 保存后，去 `Actions` 页面等待工作流完成，即可获得公开访问链接。

### 方式 B：手动从分支部署（不使用 Actions）

1. 推送到 GitHub 仓库默认分支（通常是 `main`）。
2. 打开仓库：`Settings → Pages`。
3. `Build and deployment` 选择：
   - `Source`: `Deploy from a branch`
   - `Branch`: `main` / `root`
4. 保存后等待几分钟，即可获得公开访问链接。

