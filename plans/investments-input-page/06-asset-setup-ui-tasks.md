# Investments Input Page - Asset Setup UI Tasks

## Context

目前 `Investments` 頁面的手動輸入與 CSV 匯入流程已經比前一階段完整：

- broker account setup UI 已補上
- `Investments` 頁已能過濾出可用的 broker account
- 手動輸入交易流程可建立 `deposit / buy / sell / dividend`

但實際手動驗證時又遇到下一個產品缺口：

- 使用者雖然可以建立 account
- 但系統內不一定已經有足夠的 `Asset`
- 若沒有對應的 `Asset`，手動輸入 `buy / sell / dividend` 仍無法順利完成

也就是說，目前流程仍依賴：

- 先有 seed 好的 `Asset`
- 或工程階段手動直接打 API 建資料

這仍不是完整的正式使用者流程。

## Product Decision

本階段先做：

- 最小可用的 `Asset` 手動建立 UI

本階段先不做：

- 從外部網路資源自動匯入 `Asset`
- quote / symbol search provider integration
- metadata marketplace

原因：

- 沒有手動建立入口時，整條投資輸入流程仍卡住
- 即使未來會做外部匯入，手動建立仍是必要 fallback
- 先把手動建立打通，之後再接外部來源會比較穩

## Why This Is Needed

目前 `Investments` 頁的手動輸入流程，對 `buy / sell / dividend` 而言都依賴：

1. 使用者先有可用的 `Account`
2. 系統先有可選的 `Asset`
3. 前端表單才能完成選擇並送出

如果沒有正式的 asset setup UI，實際使用上會出現：

- 使用者不知道去哪裡新增新的股票 / ETF / 幣種
- 新帳戶建好了，但沒有資產可選
- `Investments` 頁看起來可用，實際上無法完成最關鍵的交易輸入

## Scope

本任務只處理：

- `Assets` 頁提供最小可用的手動建立流程
- `Assets` 列表顯示能支援挑選與辨識
- `Investments` 頁對沒有可用資產時的引導文案

本任務不處理：

- 外部 API 搜尋 / 自動匯入資產
- 歷史價格抓取
- symbol autocomplete
- asset alias editor
- 多市場 metadata enrichment

## Current State

目前相關狀態如下：

- backend 已有 `Asset` schema 與 `/assets` API
- frontend 已有 `Assets` 頁，但目前仍偏 API tester 介面
- `Investments` 頁會讀取 `Asset` 清單供手動交易選擇
- 若 `Asset` 資料不足，使用者無法完成 `buy / sell / dividend`

## Detailed Requirements

### 1. Assets 頁提供正式手動建立資產能力

需求：

- 在現有 `Assets` 頁提供最小可用表單
- 使用者可手動建立新資產
- 第一版至少支援：
  - `symbol`
  - `name`
  - `type`
  - `baseCurrency`

表單目標：

- 不再依賴直接手打 raw JSON
- 讓一般使用者能補齊最基本的可交易資產資料

### 2. Asset 類型維持最小集合

第一版沿用目前資料模型：

- `equity`
- `etf`
- `crypto`
- `cash`

產品建議：

- `Investments` 手動交易主要會用到：
  - `equity`
  - `etf`
  - `crypto`
- `cash` 可先保留在 `Asset` master data，但在投資交易頁仍可繼續過濾掉

### 3. Assets 列表要能快速辨識可用資料

需求：

- 列表至少顯示：
  - `symbol`
  - `name`
  - `type`
  - `baseCurrency`
- 使用者可以點選既有 asset 做後續編輯準備

若本階段不做編輯，至少也要保留列表與選取能力的空間。

### 4. Investments 頁補「沒有資產時」的明確引導

需求：

- 若目前沒有任何可用資產：
  - 顯示明確提示，不要只是空白下拉
- 文案建議：
  - `No asset available. Create one in Assets first.`

若只有 `cash` 類型而沒有可交易資產，也應視為不可用狀態。

### 5. 外部匯入先列為下一階段，不綁在本任務

本任務要明確定義：

- 之後可以評估從網路資源或外部 provider 匯入 asset
- 但那是下一條需求線，不應阻擋本階段完成

也就是說：

- `manual first`
- `provider import later`

## Suggested UX Direction

`Assets` 頁第一版建議拆成兩區：

1. 建立表單
2. 既有資產列表

目標不是做完整的資產管理後台，而是補齊投資輸入流程中的前置條件。

## Suggested Implementation Order

1. frontend `Assets` 頁改成正式手動建立表單
2. frontend `Assets` 頁列表顯示正式欄位
3. frontend `Investments` 頁補沒有可用資產時的提示
4. 規劃下一階段的外部 asset import / search 能力

## Acceptance Criteria

- 使用者可在 UI 上手動建立新的 `Asset`
- 建立後，`Assets` 列表可立即看到該資料
- `Investments` 手動交易頁可選到新建立的可交易資產
- 若沒有可用資產，畫面能清楚告訴使用者要先去哪裡建立
- 本任務完成後，不再需要靠 seed 才能進行基本投資交易驗證

## Follow-Up Work

本任務完成後，下一步可評估：

- 從外部資料源搜尋 / 匯入 `Asset`
- symbol lookup
- richer metadata（市場、交易所、display name）
- `AssetAlias` 的正式管理 UI

## Handoff Notes

- 這份文件補的是「asset setup」這條新需求線
- 它的角色和 `05-broker-account-ui-tasks.md` 類似，都是在補投資輸入流程真正可用前的前置條件
- 本任務建議不要和目前 branch 的 broker account work 混做
