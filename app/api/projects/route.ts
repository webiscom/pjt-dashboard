import { NextResponse } from 'next/server';
import { getPool } from '@/app/lib/db';

export async function GET() {
  const sql = `
    SELECT A.*, @rownum:=@rownum+1 AS RNUM
      FROM (
        SELECT  PROJECT_SN
                 , PROJECT_NM
                 , (SELECT CNPT_NM FROM STM_CNPT WHERE CNPT_CD = A.BCNC_CODE) AS CNPT_NM
                 , PROJECT_PM_NM
                 , PROJECT_BEGIN_DE
                 , PROJECT_END_DE
                 , CONCAT(FNC_DATESTR(PROJECT_BEGIN_DE), ' ~ ', FNC_DATESTR(PROJECT_END_DE), ' (', TIMESTAMPDIFF(MONTH, A.PROJECT_BEGIN_DE, A.PROJECT_END_DE), ')') AS PROJECT_DE
                 , FNC_COMCODENM('C200',PROJECT_SE) AS PROJECT_SE
                 , FNC_COMCODENM('C201', COMPT_AT) AS COMPT_AT
                 , PROJECT_PM_EMPNO
                 , PROJECT_MNG_EMPNO
                 , FNC_GETKORNM(PROJECT_MNG_EMPNO) AS PROJECT_MNG_NM
                 , SIGN(PROJECT_BEGIN_DE - DATE_FORMAT(NOW(),'%Y%m%d')) AS PRE_PROJECT
                 , CASE WHEN SIGN(PROJECT_BEGIN_DE - DATE_FORMAT(NOW(),'%Y%m%d')) = 1 THEN
                     100
                   ELSE
                     (SELECT COUNT(*) FROM PJT_HNF_ACMSLT WHERE PROJECT_SN = A.PROJECT_SN AND ACMSLT_STDR_DE = DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH),'%Y%m'))
                   END ACMSLT_CNT
          FROM PJT_PROJECT A
         WHERE COMPT_AT = '0'
         ORDER BY PROJECT_SN DESC
            ) A, (SELECT @rownum := 0) ROWNUM
  ORDER BY RNUM DESC
  `;

  try {
    const pool = getPool();
    const [rows] = await pool.query(sql);
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error('Failed to fetch project list:', err);
    return NextResponse.json({ error: 'Failed to fetch project list' }, { status: 500 });
  }
}
