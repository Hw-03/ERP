import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { Download, TestInfo } from "@playwright/test";

const BACKEND = path.resolve(__dirname, "../../../backend");
const DATABASE = path.join(BACKEND, "mes_e2e.db");

/** Python always opens the isolated fixture explicitly; never the application default DB. */
export function fixturePython<T>(script: string, values: Record<string, unknown> = {}): T {
  if (!fs.existsSync(DATABASE) || !fs.existsSync(path.join(__dirname, ".e2e-seed.json"))) {
    throw new Error("admin export checks require the global-setup mes_e2e fixture");
  }
  const result = spawnSync("python", ["-c", script], {
    cwd: BACKEND, windowsHide: true, encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1",
      DATABASE_URL: `sqlite:///${DATABASE.split(path.sep).join("/")}`,
      EXPORT_FIXTURE: JSON.stringify(values) },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim()) as T;
}

export type ExportFixture = { itemId: string; dates: string[]; logIds: string[]; notes: string[]; deltas: number[]; month: string; year: number };

/** Dedicated historical export rows span both KST midnights and an original/reversal pair. */
export function seedExportRows(itemId: string, employeeId: string, employeeName: string, date: string): ExportFixture {
  return fixturePython<ExportFixture>([
    "import json,os,uuid", "from datetime import datetime,timedelta", "from app.database import SessionLocal",
    "from app.models import TransactionLog,TransactionTypeEnum,Inventory,IoBatch", "v=json.loads(os.environ['EXPORT_FIXTURE'])",
    "db=SessionLocal()", "try:", "    midnight=datetime.fromisoformat(v['date'])-timedelta(hours=9)",
    "    times=[midnight-timedelta(minutes=1),midnight,midnight+timedelta(days=1,minutes=-1),midnight+timedelta(days=1)]",
    "    notes=[v['itemId']+'-excluded-before',v['itemId']+'-included-한글, \"인용\"\\n다음줄',v['itemId']+'-included-reversed',v['itemId']+'-excluded-after-reversal']",
    "    deltas=[3,-2,1,-1]; kinds=['RECEIVE','INTERNAL_USE','RECEIVE','RECEIVE']; logs=[]; running=0",
    "    for index,(when,delta,kind,note) in enumerate(zip(times,deltas,kinds,notes)):",
    "        batch=IoBatch(work_type='warehouse_io',sub_type='receive_supplier' if kind=='RECEIVE' else 'use_as',status='completed',requester_employee_id=uuid.UUID(v['employeeId']),requester_name=v['employeeName'],requester_department='조립',from_department='공급사' if delta>0 else '창고',to_department='공급사' if index==3 else ('창고' if delta>0 else 'AS'),supplier_name_snapshot='검수 공급사' if kind=='RECEIVE' else None,notes=note,created_at=when)",
    "        db.add(batch); db.flush()",
    "        log=TransactionLog(item_id=uuid.UUID(v['itemId']),transaction_type=TransactionTypeEnum(kind),quantity_change=delta,quantity_before=running,quantity_after=running+delta,warehouse_qty_before=running,warehouse_qty_after=running+delta,department_qty_before=0,department_qty_after=0,produced_by=v['employeeName'],producer_employee_id=uuid.UUID(v['employeeId']),notes=note,reference_no='QA-EXPORT-'+str(index),department='AS' if kind=='INTERNAL_USE' else '창고',operation_batch_id=batch.batch_id,inventory_effect=[{'scope':'warehouse','delta':delta}],created_at=when)",
    "        if index==3: log.reverses_log_id=logs[2].log_id; logs[2].cancelled=True; logs[2].cancelled_at=when; logs[2].cancel_reason='합성 원본 내보내기 회귀'",
    "        db.add(log); db.flush(); logs.append(log); running+=delta",
    "    inventory=db.query(Inventory).filter_by(item_id=uuid.UUID(v['itemId'])).one(); inventory.quantity=running; inventory.warehouse_qty=running",
    "    db.commit()",
    "    print(json.dumps({'itemId':v['itemId'],'dates':[t.isoformat() for t in times],'logIds':[str(l.log_id) for l in logs],'notes':notes,'deltas':deltas,'month':times[1].strftime('%Y-%m'),'year':int(v['date'][:4])},ensure_ascii=False))",
    "finally:", "    db.close()",
  ].join("\n"), { itemId, employeeId, employeeName, date });
}

/** Read-only business snapshot excludes telemetry, which records screen views normally. */
export function businessSnapshot(): Record<string, unknown> {
  return fixturePython([
    "import json,os,sqlite3", "from app.database import engine",
    "db=sqlite3.connect('file:'+engine.url.database+'?mode=ro',uri=True)",
    "try:", "    result={}",
    "    for table in ['items','inventory','inventory_locations','transaction_logs','io_batches','io_lines','stock_requests','stock_request_lines','shipping_requests','shipping_allocations','inventory_operations','inventory_operation_lines','inventory_operation_effects']:",
    "        if db.execute(\"SELECT 1 FROM sqlite_master WHERE type='table' AND name=?\",(table,)).fetchone(): result[table]=sorted([list(row) for row in db.execute('SELECT * FROM '+table)],key=repr)",
    "    print(json.dumps(result,ensure_ascii=False))", "finally:", "    db.close()",
  ].join("\n"));
}

export function setInventoryMismatch(itemIds: string[], mismatch: boolean): void {
  fixturePython([
    "import json,os,uuid", "from app.database import SessionLocal", "from app.models import Inventory",
    "v=json.loads(os.environ['EXPORT_FIXTURE']); db=SessionLocal()", "try:",
    "    for itemId in v['ids']:", "        row=db.query(Inventory).filter_by(item_id=uuid.UUID(itemId)).one(); row.quantity=row.warehouse_qty+(1 if v['mismatch'] else 0)",
    "    db.commit(); print('null')", "finally:", "    db.close()",
  ].join("\n"), { ids: itemIds, mismatch });
}

export function deleteExportFixture(fixture: ExportFixture): void {
  fixturePython([
    "import json,os,uuid", "from app.database import SessionLocal", "from app.models import TransactionLog,Inventory,IoBatch,Item",
    "v=json.loads(os.environ['EXPORT_FIXTURE']); db=SessionLocal()", "try:",
    "    item=db.get(Item,uuid.UUID(v['itemId'])); assert item and item.item_name.startswith('QA 내보내기 ')",
    "    logs=db.query(TransactionLog).filter_by(item_id=item.item_id).all(); batchIds=[r.operation_batch_id for r in logs if r.operation_batch_id]",
    "    for log in logs: log.reverses_log_id=None",
    "    db.flush()", "    db.query(TransactionLog).filter_by(item_id=item.item_id).delete(synchronize_session=False)",
    "    db.query(IoBatch).filter(IoBatch.batch_id.in_(batchIds)).delete(synchronize_session=False)",
    "    db.query(Inventory).filter_by(item_id=item.item_id).delete(synchronize_session=False); db.delete(item); db.commit(); print('null')",
    "finally:", "    db.close()",
  ].join("\n"), fixture);
}

export type TerminalFacts = { terminals: { id: string; name: string }[]; rows: { terminalName: string; employeeCode: string; summary: string; relatedId: string; sessionId: string; requestId: string }[] };
export function terminalFacts(terminalId: string): TerminalFacts {
  return fixturePython([
    "import json,os", "from app.database import SessionLocal", "from app.models import AuditTerminal,ActivityAuditLog",
    "v=json.loads(os.environ['EXPORT_FIXTURE']); db=SessionLocal()", "try:",
    "    terminals=[{'id':r.terminal_id,'name':r.name} for r in db.query(AuditTerminal).filter_by(terminal_id=v['id'])]",
    "    rows=[{'terminalName':r.terminal_name,'employeeCode':r.actor_employee_code,'summary':r.target_summary,'relatedId':r.related_id,'sessionId':r.session_id,'requestId':r.request_id} for r in db.query(ActivityAuditLog).filter_by(terminal_id=v['id']).order_by(ActivityAuditLog.occurred_at,ActivityAuditLog.audit_id) if r.action_key=='http.put.admin.activity-audit.terminals.current']",
    "    print(json.dumps({'terminals':terminals,'rows':rows},ensure_ascii=False))", "finally:", "    db.close()",
  ].join("\n"), { id: terminalId });
}

export type FileRows = { rows: string[][]; sheets?: string[] };
/** Parse the actual Playwright download, not a second API-generated file. */
export async function downloadedRows(download: Download, info: TestInfo): Promise<FileRows> {
  const file = info.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  if (await download.failure()) throw new Error(String(await download.failure()));
  await info.attach(download.suggestedFilename(), { path: file });
  return fixturePython<FileRows>([
    "import csv,json,os", "from datetime import datetime,date", "from openpyxl import load_workbook",
    "v=json.loads(os.environ['EXPORT_FIXTURE']); file=v['file']",
    "def text(cell): return cell.isoformat() if isinstance(cell,(datetime,date)) else ('' if cell is None else str(cell))",
    "if file.endswith('.csv'):", "    with open(file,encoding='utf-8-sig',newline='') as stream: result={'rows':list(csv.reader(stream))}",
    "else:", "    book=load_workbook(file,data_only=True); result={'sheets':book.sheetnames,'rows':[[text(cell) for cell in row] for row in book.active.iter_rows(values_only=True)]}; book.close()",
    "print(json.dumps(result,ensure_ascii=False))",
  ].join("\n"), { file });
}

export function rawDatabaseRows(month: string): string[][] {
  return fixturePython([
    "import json,os", "from datetime import datetime", "from app.database import SessionLocal", "from app.models import TransactionLog,Item,Employee",
    "v=json.loads(os.environ['EXPORT_FIXTURE']); db=SessionLocal()", "try:",
    "    names={'RECEIVE':'입고','SHIP':'출고','TRANSFER_TO_PROD':'창고→생산 이동','TRANSFER_TO_WH':'생산→창고 이동','TRANSFER_DEPT':'부서간 이동','ADJUST':'수량 조정','SUPPLIER_RETURN':'공급사 반품','MARK_DEFECTIVE':'불량 처리','DISASSEMBLE':'분해','INTERNAL_USE':'AS·연구 사용출고','MATERIAL_OUT':'원자재 출고'}",
    "    employees={r.employee_id:r.employee_code for r in db.query(Employee)}; result=[]",
    "    for log,item in db.query(TransactionLog,Item).join(Item,Item.item_id==TransactionLog.item_id).order_by(TransactionLog.created_at,TransactionLog.log_id):",
    "        kind=log.transaction_type.value",
    "        if log.created_at.strftime('%Y-%m')!=v['month'] or kind not in names: continue",
    "        label={'AS':'AS 반출','연구':'연구소 반출'}.get(log.department,names[kind]) if kind=='INTERNAL_USE' else names[kind]",
    "        result.append([log.created_at.strftime('%Y-%m-%d %H:%M:%S'),label,item.mes_code or '',item.item_name or '',str(log.quantity_change),'' if log.quantity_before is None else str(log.quantity_before),'' if log.quantity_after is None else str(log.quantity_after),log.reference_no or '',log.produced_by or '',employees.get(log.producer_employee_id,'') or '',(log.notes or '').replace('\\r',' ').replace('\\n',' '),str(log.log_id)])",
    "    print(json.dumps(result,ensure_ascii=False))", "finally:", "    db.close()",
  ].join("\n"), { month });
}
