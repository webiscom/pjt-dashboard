import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/app/lib/db';

export async function GET(request: NextRequest) {
  const projNo = request.nextUrl.searchParams.get('projNo');
  if (!projNo) {
    return NextResponse.json({ error: 'projNo is required' }, { status: 400 });
  }

  const sql = `
    SELECT
      TASK_SN AS ID,
      TASK_NM AS TEXT,
      DATE_FORMAT(BGNG_YMD, '%d-%m-%Y') AS START_DATE,
      DATE_FORMAT(CMPTN_YMD, '%d-%m-%Y') AS END_DATE,
      REQ_CNT AS DURATION,
      PRGRS_RT AS PROGRESS,
      'TRUE' AS OPEN,
      NULL AS PARENT,
      TASK_SN AS SOURCE,
      LINK_TASK_SN AS TARGET,
      LINK_TYPE AS TYPE,
      TASK_PIC AS USER,
      ACTL_PLAN_JOB_QTY,
      TOTAL_JOB_QTY,
      PLAN_JOB_QTY,
      DATE_FORMAT(ACTL_BGNG_YMD, '%Y-%m-%d') AS ACTL_BGNG_YMD,
      DATE_FORMAT(ACTL_CMPTN_YMD, '%Y-%m-%d') AS ACTL_CMPTN_YMD,
      ACTL_TOTAL_JOB_QTY,
      PRFMNC
    FROM ECS_GANTT_TASK
    WHERE UP_TASK_SN IS NULL
      AND GANTT_PROJ_NO = ?
    UNION ALL
    SELECT
      TASK_SN AS ID,
      TASK_NM AS TEXT,
      DATE_FORMAT(BGNG_YMD, '%d-%m-%Y') AS START_DATE,
      DATE_FORMAT(CMPTN_YMD, '%d-%m-%Y') AS END_DATE,
      REQ_CNT AS DURATION,
      PRGRS_RT AS PROGRESS,
      'TRUE' AS OPEN,
      UP_TASK_SN AS PARENT,
      TASK_SN AS SOURCE,
      LINK_TASK_SN AS TARGET,
      LINK_TYPE AS TYPE,
      TASK_PIC AS USER,
      ACTL_PLAN_JOB_QTY,
      TOTAL_JOB_QTY,
      PLAN_JOB_QTY,
      DATE_FORMAT(ACTL_BGNG_YMD, '%Y-%m-%d') AS ACTL_BGNG_YMD,
      DATE_FORMAT(ACTL_CMPTN_YMD, '%Y-%m-%d') AS ACTL_CMPTN_YMD,
      ACTL_TOTAL_JOB_QTY,
      PRFMNC
    FROM ECS_GANTT_TASK
    WHERE UP_TASK_SN IS NOT NULL
      AND GANTT_PROJ_NO = ?
  `;

  try {
    const pool = getPool();
    const [rows] = await pool.query(sql, [projNo, projNo]);
    return NextResponse.json({ data_pj: rows });
  } catch (err) {
    console.error('Failed to fetch gantt tasks:', err);
    return NextResponse.json({ error: 'Failed to fetch gantt tasks' }, { status: 500 });
  }
}
