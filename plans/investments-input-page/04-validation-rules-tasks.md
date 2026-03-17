# Investments Input Page - Validation Rules and Import Spec

## Context

本文件集中整理本波功能的規則，避免規則散落在對話、前端表單與後端 service 之間。目標是讓後續換 session 時，仍能以此文件作為單一事實來源。

本波規則涵蓋：

- 手動輸入交易規則
- CSV 欄位 mapping 規則
- row-level import validation
- 重複匯入判定

## Scope

本文件只處理：

- `deposit`
- `buy`
- `sell`
- `dividend`

不處理：

- `withdraw`
- `fee` 類型手動輸入頁面
- holdings / positions
- multi-currency conversion

## Manual Transaction Rules

### Shared Rules

- `accountId` 必填
- `tradeTime` 必填且必須是可解析日期
- `amount` 必須為正數
- `fee` 若有值，必須 `>= 0`
- `tax` 若有值，必須 `>= 0`
- `note` 可空
- `brokerOrderNo` 可空

### Deposit

- `type = deposit`
- `assetId` 不應提供
- `amount > 0`
- `quantity` 不應提供
- `price` 不應提供
- `fee` 可為 0 或空
- `tax` 可為 0 或空

### Buy

- `type = buy`
- `assetId` 必填
- `quantity > 0`
- `price > 0`
- `fee >= 0`
- `tax >= 0`
- `amount > 0`
- 前端建議用：
  - `amount = quantity * price + fee + tax`

### Sell

- `type = sell`
- `assetId` 必填
- `quantity > 0`
- `price > 0`
- `fee >= 0`
- `tax >= 0`
- `amount > 0`
- 前端建議用：
  - `amount = quantity * price - fee - tax`

### Dividend

- `type = dividend`
- `assetId` 必填
- `amount > 0`
- `quantity` 不應提供
- `price` 不應提供

## CSV Import Spec

### CSV Import Preconditions

- 使用者必須先選擇 `account`
- 系統必須能從該 `account` 讀到 `broker`
- 系統必須存在對應的 `AssetAlias`

### 第一版支援欄位

CSV 標頭：

- `股名`
- `日期`
- `成交股數`
- `淨收付`
- `成交單價`
- `成交價金`
- `手續費`
- `交易稅`
- `稅款`
- `委託書號`
- `幣別`
- `備註`

### CSV Mapping Rules

- `股名` -> 透過 `AssetAlias` 查出 `assetId`
- `日期` -> `tradeTime`
- `成交股數` -> `quantity`
- `淨收付` -> 決定 `type` 與 `amount`
- `成交單價` -> `price`
- `手續費` -> `fee`
- `交易稅 + 稅款` -> `tax`
- `委託書號` -> `brokerOrderNo`
- `備註` -> `note`

### Type Inference Rules

- `淨收付 < 0` -> `buy`
- `淨收付 > 0` -> `sell`
- `淨收付 = 0` -> invalid row

### Amount Rules

- `amount = abs(淨收付)`
- 第一版以券商提供的 `淨收付` 為準，不用重新根據 `quantity * price` 覆寫

### Tax Rules

- `tax = 交易稅 + 稅款`
- 若兩欄皆空，視為 0
- 若其中一欄缺失但另一欄存在，缺的欄位視為 0

### Currency Rules

- CSV 的 `幣別` 第一版只做輕量驗證
- `幣別` 應與目標 account 的 `currency` 一致
- 若不一致，該 row 應報錯
- 目前 `Transaction` 不單獨存 currency，仍以 `Account.currency` 為準

### Broker Order No Rules

- `委託書號` 若空白，可視需求決定是否允許匯入
- 建議第一版：
  - 若 CSV 有此欄位但內容為空，視為錯誤
  - 若 `(accountId, brokerOrderNo)` 已存在，視為重複匯入錯誤

## Row-Level Validation Checklist

每一列需檢查：

- `股名` 非空
- `日期` 非空且可 parse
- `成交股數 > 0`
- `淨收付 != 0`
- `成交單價 > 0`
- `手續費 >= 0`
- `交易稅 >= 0`
- `稅款 >= 0`
- `委託書號` 非空
- `幣別` 可映射到系統幣別
- `幣別` 與 account currency 一致
- `股名` 可透過 `AssetAlias` 找到唯一資產
- `brokerOrderNo` 未重複

## Error Reporting Rules

回傳錯誤時，至少要包含：

- `row`
- `field`
- `message`

錯誤訊息範例：

- `row=2, field=股名, message=Asset alias not found for 富邦台50`
- `row=4, field=淨收付, message=Net settlement cannot be zero`
- `row=6, field=委託書號, message=Duplicate broker order number for selected account`

## Import Behavior Rules

- 匯入採部分成功
- 單列失敗不回滾其他成功列
- 每列成功匯入後需建立 transaction 並自動過帳
- 匯入完成後回傳 summary 與 errors

## Known Limitations

- `sell` 的成本 basis 與已實現損益完整正確性不在本波解決
- 第一版不支援多券商欄位自動辨識
- 第一版不做 preview / confirm step
- 第一版不自動建立新的 `Asset`

## Acceptance Criteria

- 前後端都遵守同一組 type 規則
- CSV 匯入能依 `淨收付` 正負推導 `buy/sell`
- CSV 匯入能正確計算 `tax = 交易稅 + 稅款`
- 系統會驗證 account currency 與 CSV 幣別一致
- 系統會驗證 `brokerOrderNo` 不重複
- 每個錯誤列都能回傳 `row + field + message`

## Handoff Notes

- 本文件優先於零散對話記錄
- 若未來增加新券商格式，請新增 broker-specific supplement，但不要直接改掉第一版通用規則
