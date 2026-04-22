/* Shared sample data for the X-Ray ERP mockups */

const MODELS = ["DX3000", "ADX4000W", "ADX6000", "COCOON", "SOLO"];
const CATEGORIES = ["원자재", "조립자재", "발생부자재", "완제품", "미분류"];
const PARTS = ["조립출하", "고압파트", "진공파트", "튜닝파트", "튜브파트"];

const EMPLOYEES = [
  { id: "E001", name: "김준우", short: "김", dept: "조립", role: "조립/출하 리더", color: "teal" },
  { id: "E002", name: "박서연", short: "박", dept: "고압", role: "고압 파트", color: "amber" },
  { id: "E003", name: "이도현", short: "이", dept: "진공", role: "진공 파트", color: "sky" },
  { id: "E004", name: "최민지", short: "최", dept: "튜닝", role: "튜닝 파트", color: "rose" },
  { id: "E005", name: "정하늘", short: "정", dept: "튜브", role: "튜브 파트", color: "emerald" },
  { id: "E006", name: "한유진", short: "한", dept: "출하", role: "출하 담당", color: "violet" },
  { id: "E007", name: "오지훈", short: "오", dept: "연구", role: "연구 지원", color: "slate" },
  { id: "E008", name: "윤가은", short: "윤", dept: "AS", role: "AS 지원", color: "cyan" },
  { id: "E009", name: "문현우", short: "문", dept: "기타", role: "관리자", color: "indigo" },
];

const ITEMS = [
  { code: "BA-000001", erp: "3-AA-0001", name: "POWER LED", cat: "조립자재", part: "조립출하", model: "DX3000", stock: 200, safety: 50, loc: "조립", unit: "EA", vendor: "—", status: "ok" },
  { code: "BA-000002", erp: "공-AA-0001", name: "FRONT COVER (듀얼 슬라이드)", cat: "조립자재", part: "조립출하", model: "DX3000 화이트", stock: 130, safety: 40, loc: "조립", unit: "EA", vendor: "—", status: "ok" },
  { code: "BA-000003", erp: "공-AA-0002", name: "REAR COVER", cat: "조립자재", part: "조립출하", model: "DX3000 화이트", stock: 100, safety: 30, loc: "조립", unit: "EA", vendor: "—", status: "ok" },
  { code: "BA-000004", erp: "3-AA-0002", name: "LCD LED", cat: "조립자재", part: "조립출하", model: "DX3000", stock: 100, safety: 30, loc: "조립", unit: "EA", vendor: "—", status: "ok" },
  { code: "BA-000005", erp: "3-AA-0003", name: "EX LED (왼쪽)", cat: "조립자재", part: "조립출하", model: "DX3000", stock: 100, safety: 30, loc: "조립", unit: "EA", vendor: "—", status: "ok" },
  { code: "BA-000006", erp: "3-AA-0004", name: "EX LED (오른쪽)", cat: "조립자재", part: "조립출하", model: "DX3000", stock: 100, safety: 30, loc: "조립", unit: "EA", vendor: "—", status: "ok" },
  { code: "BA-000007", erp: "3-AA-0005", name: "HAND STRAP", cat: "조립자재", part: "조립출하", model: "DX3000", stock: 45, safety: 60, loc: "조립", unit: "EA", vendor: "세원텍", status: "low" },
  { code: "BA-000008", erp: "3-AA-0006", name: "HAND STRAP 로고없음 사파리", cat: "조립자재", part: "조립출하", model: "DX3000", stock: 80, safety: 30, loc: "조립", unit: "EA", vendor: "세원텍", status: "ok" },
  { code: "BA-000009", erp: "3-AA-0007", name: "20cm CONE", cat: "조립자재", part: "조립출하", model: "DX3000 블랙", stock: 60, safety: 20, loc: "조립", unit: "EA", vendor: "—", status: "ok" },
  { code: "BA-000010", erp: "3-AA-0008", name: "LCD 윈도우", cat: "조립자재", part: "조립출하", model: "DX3000", stock: 0, safety: 20, loc: "조립", unit: "EA", vendor: "디스플레이텍", status: "out" },
  { code: "BA-000011", erp: "3-AA-0009", name: "POWER BUTTON", cat: "조립자재", part: "조립출하", model: "DX3000", stock: 310, safety: 80, loc: "조립", unit: "EA", vendor: "—", status: "ok" },
  { code: "BA-000012", erp: "3-AA-0010", name: "SCAN BUTTON", cat: "조립자재", part: "조립출하", model: "DX3000", stock: 290, safety: 80, loc: "조립", unit: "EA", vendor: "—", status: "ok" },
  { code: "BA-000061", erp: "공-AA-0069", name: "LOCK KNOB", cat: "조립자재", part: "조립출하", model: "COCOON 화이트", stock: 8, safety: 20, loc: "조립", unit: "EA", vendor: "—", status: "low" },
  { code: "BA-000062", erp: "공-AA-0070", name: "LOCK INNER", cat: "조립자재", part: "조립출하", model: "COCOON 화이트", stock: 8, safety: 20, loc: "조립", unit: "EA", vendor: "—", status: "low" },
  { code: "BA-000127", erp: "공-BB-0127", name: "배터리 단자대", cat: "원자재", part: "고압파트", model: "ADX4000W", stock: 67, safety: 100, loc: "본체조립", unit: "EA", vendor: "파워셀", status: "low" },
  { code: "BA-000128", erp: "공-BB-0128", name: "HV 케이블", cat: "원자재", part: "고압파트", model: "ADX4000W", stock: 0, safety: 30, loc: "고압실", unit: "M", vendor: "삼화케이블", status: "out" },
  { code: "BA-000129", erp: "공-BB-0129", name: "진공 하우징", cat: "원자재", part: "진공파트", model: "ADX6000", stock: 24, safety: 10, loc: "진공실", unit: "EA", vendor: "바이셀", status: "ok" },
];

const HISTORY = [
  { ts: "04/21 01:28", type: "출고", name: "배터리 단자대", code: "BA-000127", cat: "본체조립", qty: -33, from: 100, to: 67, who: "최민지", ref: "—", memo: "—" },
  { ts: "04/21 00:38", type: "입고", name: "POWER LED", code: "BA-000001", cat: "본체조립", qty: +100, from: 100, to: 200, who: "문현우", ref: "PO-2041", memo: "정기 입고" },
  { ts: "04/21 00:16", type: "입고", name: "FRONT COVER (듀얼 슬라이드)", code: "BA-000002", cat: "본체조립", qty: +30, from: 100, to: 130, who: "문현우", ref: "PO-2041", memo: "—" },
  { ts: "04/20 18:52", type: "조정", name: "LCD 윈도우", code: "BA-000010", cat: "본체조립", qty: -5, from: 5, to: 0, who: "한유진", ref: "—", memo: "불량 처리" },
  { ts: "04/20 17:14", type: "생산입고", name: "REAR COVER", code: "BA-000003", cat: "본체조립", qty: +50, from: 50, to: 100, who: "김준우", ref: "WO-0315", memo: "조립 완료" },
  { ts: "04/20 16:05", type: "출고", name: "HAND STRAP", code: "BA-000007", cat: "본체조립", qty: -15, from: 60, to: 45, who: "박서연", ref: "—", memo: "—" },
  { ts: "04/20 14:30", type: "자동차감", name: "SCAN BUTTON", code: "BA-000012", cat: "조립자재", qty: -10, from: 300, to: 290, who: "시스템", ref: "WO-0314", memo: "BOM 차감" },
];

window.ERP_DATA = { MODELS, CATEGORIES, PARTS, EMPLOYEES, ITEMS, HISTORY };
