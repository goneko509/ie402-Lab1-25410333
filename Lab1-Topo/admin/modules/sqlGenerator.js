/**
 * @module sqlGenerator
 * @description Các hàm hỗ trợ sinh mã SQL cho các thực thể và loại bỏ trùng lặp tọa độ.
 * Điều kiện đầu ra: Trả về chuỗi SQL hợp lệ tương ứng với Point, Node và lọc được điểm trùng.
 */
import { TOLERANCE } from './config.js';

export function deduplicatePoints(pts) {
    const unique = [];
    for (const p of pts) {
        if (unique.length === 0) {
            unique.push(p);
        } else {
            const last = unique[unique.length - 1];
            if (Math.abs(last[0] - p[0]) > TOLERANCE || Math.abs(last[1] - p[1]) > TOLERANCE) {
                unique.push(p);
            }
        }
    }
    return unique;
}

export function getPtSql(pt, ptName, idpVar) {
    const lon = pt[0].toFixed(6), lat = pt[1].toFixed(6);
    return `-- =============================================\n` +
           `-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY\n` +
           `-- =============================================\n` +
           `IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - ${lon}) <= ${TOLERANCE} AND ABS(LAT - ${lat}) <= ${TOLERANCE})\n` +
           `BEGIN\n` +
           `    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'${ptName}', ${lon}, ${lat});\n` +
           `END;\n` +
           `-- =============================================\n` +
           `-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM\n` +
           `-- =============================================\n` +
           `DECLARE @${idpVar} INT;\n` +
           `SELECT TOP 1 @${idpVar} = IDP FROM TOPO_POINT WHERE ABS(LONG - ${lon}) <= ${TOLERANCE} AND ABS(LAT - ${lat}) <= ${TOLERANCE};`;
}

export function getNodeSql(idpVar, nodeName, category) {
    return `-- Nếu điểm này là Node, chèn vào TOPO_NODE bằng @${idpVar} (tránh lặp lại Point)\n` +
           `IF NOT EXISTS (SELECT 1 FROM TOPO_NODE WHERE IDP = @${idpVar})\n` +
           `BEGIN\n` +
           `    INSERT INTO TOPO_NODE (IDP, NAME, CATEGORY) VALUES (@${idpVar}, N'${nodeName}', N'${category}');\n` +
           `END;`;
}

export function generateExportSQL(data) {
    const { points, nodes, arcs, polys, arcPoints, polyArcs } = data;
    let sql = [];
    sql.push(`BEGIN TRANSACTION;\n`);
    
    // Clear old data
    sql.push(`DELETE FROM TOPO_POLY_ARC;`);
    sql.push(`DELETE FROM TOPO_ARC_POINT;`);
    sql.push(`UPDATE TOPO_ARC SET IDPOL = NULL, IDPOR = NULL;`);
    sql.push(`DELETE FROM TOPO_ARC;`);
    sql.push(`DELETE FROM TOPO_POLY;`);
    sql.push(`DELETE FROM TOPO_NODE;`);
    sql.push(`DELETE FROM TOPO_POINT;\n`);
    
    // 1. TOPO_POINT
    sql.push(`-- 1. Chèn TOPO_POINT trước`);
    sql.push(`SET IDENTITY_INSERT TOPO_POINT ON;`);
    points.forEach(p => {
        sql.push(`INSERT INTO TOPO_POINT (IDP, NAME, LONG, LAT) VALUES (${p.idp}, N'${p.name}', ${p.lon}, ${p.lat});`);
    });
    sql.push(`SET IDENTITY_INSERT TOPO_POINT OFF;\n`);

    // 2. TOPO_NODE
    sql.push(`-- 2. Chèn TOPO_NODE (Tham chiếu IDP)`);
    sql.push(`SET IDENTITY_INSERT TOPO_NODE ON;`);
    nodes.forEach(n => {
        sql.push(`INSERT INTO TOPO_NODE (IDN, IDP, NAME, CATEGORY) VALUES (${n.idn}, ${n.idp}, N'${n.name}', N'${n.category}');`);
    });
    sql.push(`SET IDENTITY_INSERT TOPO_NODE OFF;\n`);

    // 3. TOPO_POLY (Phụ thuộc IDP, nhưng không có IDP trong bảng, nên độc lập)
    if (polys && polys.length > 0) {
        sql.push(`-- 3. Chèn TOPO_POLY trước khi TOPO_ARC tham chiếu tới (nếu có)`);
        sql.push(`SET IDENTITY_INSERT TOPO_POLY ON;`);
        polys.forEach(po => {
            sql.push(`INSERT INTO TOPO_POLY (IDPO, NAME) VALUES (${po.idpo}, N'${po.name}');`);
        });
        sql.push(`SET IDENTITY_INSERT TOPO_POLY OFF;\n`);
    }

    // 4. TOPO_ARC
    sql.push(`-- 4. Chèn TOPO_ARC (BẮT BỘC IDNB và IDNE phải nằm trong danh sách IDN của TOPO_NODE ở trên)`);
    sql.push(`SET IDENTITY_INSERT TOPO_ARC ON;`);
    arcs.forEach(a => {
        const idnb = a.idnb;
        const idne = a.idne;
        if (!nodes.find(n => n.idn === idnb)) {
            throw new Error(`❌ Lỗi khóa ngoại: IDNB=${idnb} của Arc '${a.name}' không tồn tại trong danh sách TOPO_NODE.`);
        }
        if (!nodes.find(n => n.idn === idne)) {
            throw new Error(`❌ Lỗi khóa ngoại: IDNE=${idne} của Arc '${a.name}' không tồn tại trong danh sách TOPO_NODE.`);
        }
        let pl = a.idpol || 'NULL';
        let pr = a.idpor || 'NULL';
        let arcType = a.type || 'Line';
        sql.push(`INSERT INTO TOPO_ARC (IDA, IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) VALUES (${a.ida}, ${idnb}, ${idne}, ${pl}, ${pr}, N'${a.name}', N'${arcType}');`);
    });
    sql.push(`SET IDENTITY_INSERT TOPO_ARC OFF;\n`);

    // 5. TOPO_ARC_POINT
    if (arcPoints && arcPoints.length > 0) {
        const validArcIds = new Set(arcs.map(a => a.ida));
        const invalidArcPoints = arcPoints.filter(ap => !validArcIds.has(ap.ida));
        
        if (invalidArcPoints.length > 0) {
            console.error("❌ Phát hiện điểm trung gian chứa IDA không tồn tại trong TOPO_ARC:", invalidArcPoints);
            throw new Error(`❌ Lỗi khóa ngoại TOPO_ARC_POINT: Tồn tại IDA không hợp lệ (ví dụ: ${invalidArcPoints[0].ida}).`);
        }
        
        sql.push(`-- 5. CHỈ CHÈN TOPO_ARC_POINT SAU KHI TOPO_ARC ĐÃ ĐƯỢC CHÈN XONG`);
        arcPoints.forEach(ap => {
            sql.push(`INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES (${ap.ida}, ${ap.idp}, ${ap.stt});`);
        });
        sql.push('');
    }

    // 6. TOPO_POLY_ARC
    if (polyArcs && polyArcs.length > 0) {
        sql.push(`-- 6. Chèn TOPO_POLY_ARC`);
        polyArcs.forEach(pa => {
            sql.push(`INSERT INTO TOPO_POLY_ARC (IDPO, IDA, STT) VALUES (${pa.idpo}, ${pa.ida}, ${pa.stt});`);
        });
        sql.push('');
    }

    sql.push(`\nCOMMIT;`);
    return sql;
}
