const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = 3001; // Lab1-Topo dùng port 3001 (Lab1-Network dùng 3000)

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

const configPath = path.join(__dirname, '../db/dbconfig.json');
const dbConfigRaw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const dbOptions = dbConfigRaw.Database;

const sqlConfig = {
    user: dbOptions.Authentication.UserId,
    password: dbOptions.Authentication.Password,
    database: dbOptions.DatabaseName,
    server: dbOptions.Server,
    port: dbOptions.Port,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: {
        encrypt: dbOptions.Options.Encrypt,
        trustServerCertificate: dbOptions.Options.TrustServerCertificate
    }
};

const poolPromise = new sql.ConnectionPool(sqlConfig)
    .connect()
    .then(pool => {
        console.log('Đã kết nối thành công đến CSDL SQL Server! (Lab1-Topo)');
        return pool;
    })
    .catch(err => {
        console.error('Lỗi kết nối CSDL: ', err);
        process.exit(1);
    });

// =============================================
// API /api/topo: Trả về toàn bộ dữ liệu Mô hình Tô-pô
// =============================================
app.get('/api/topo', async (req, res) => {
    try {
        const pool = await poolPromise;

        // 1. Lấy tất cả điểm thô
        const rawPointsResult = await pool.request().query(`
            SELECT IDP, NAME, LONG, LAT
            FROM TOPO_POINT
        `);

        // 2. Lấy Nodes
        const nodesResult = await pool.request().query(`
            SELECT N.IDN, N.NAME, N.CATEGORY, P.LONG, P.LAT, P.IDP, P.NAME AS PointName
            FROM TOPO_NODE N
            JOIN TOPO_POINT P ON N.IDP = P.IDP
        `);

        // 3. Lấy Arcs (với thông tin Node đầu/cuối và Poly trái/phải)
        const arcsResult = await pool.request().query(`
            SELECT A.IDA, A.NAME, A.TYPE,
                   A.IDNB, A.IDNE, A.IDPOL, A.IDPOR,
                   P_S.LONG AS LONG_S, P_S.LAT AS LAT_S,
                   P_E.LONG AS LONG_E, P_E.LAT AS LAT_E
            FROM TOPO_ARC A
            JOIN TOPO_NODE NB ON A.IDNB = NB.IDN
            JOIN TOPO_NODE NE ON A.IDNE = NE.IDN
            JOIN TOPO_POINT P_S ON NB.IDP = P_S.IDP
            JOIN TOPO_POINT P_E ON NE.IDP = P_E.IDP
        `);

        // 4. Lấy điểm trung gian của Arcs
        const arcPointsResult = await pool.request().query(`
            SELECT AP.IDA, AP.STT, AP.IDP, P.LONG, P.LAT
            FROM TOPO_ARC_POINT AP
            JOIN TOPO_POINT P ON AP.IDP = P.IDP
            ORDER BY AP.IDA, AP.STT
        `);

        // 5. Lấy Polygons (qua POLY_ARC → ARC → ARC_POINT để tái tạo hình dạng)
        const polysResult = await pool.request().query(`
            SELECT PO.IDPO, PO.NAME, PO.LOCATION, PO.IDR, PA.IDA, PA.STT AS ARC_STT
            FROM TOPO_POLY PO
            JOIN TOPO_POLY_ARC PA ON PO.IDPO = PA.IDPO
            ORDER BY PO.IDPO, PA.STT
        `);

        // 6. Lấy Regions
        const regionsResult = await pool.request().query(
            `SELECT IDR, DESCRIPTION FROM TOPO_REGION`
        );

        // =============================================
        // Định dạng dữ liệu trả về
        // =============================================
        const jsondata = {
            raw_points: [],
            nodes:      [],
            arcs:       [],
            polygons:   [],
            regions:    [],
            nodePointIds: [],
            arcPointIds: []
        };

        // Raw points
        rawPointsResult.recordset.forEach(p => {
            jsondata.raw_points.push({ IDP: p.IDP, NAME: p.NAME, LONG: p.LONG, LAT: p.LAT });
        });

        // Nodes
        nodesResult.recordset.forEach(n => {
            jsondata.nodes.push({
                IDN: n.IDN, type: 'point',
                longitude: n.LONG, latitude: n.LAT,
                Name: n.NAME, Category: n.CATEGORY,
                IDP: n.IDP, PointName: n.PointName
            });
            jsondata.nodePointIds.push(n.IDP);
        });

        // Gom điểm trung gian theo IDA
        const arcMidPoints = {};
        arcPointsResult.recordset.forEach(ap => {
            if (!arcMidPoints[ap.IDA]) arcMidPoints[ap.IDA] = [];
            arcMidPoints[ap.IDA].push([ap.LONG, ap.LAT]);
            jsondata.arcPointIds.push(ap.IDP);
        });

        // Arcs: xây dựng path đầy đủ [start, ...mid, end]
        arcsResult.recordset.forEach(a => {
            const path = [[a.LONG_S, a.LAT_S]];
            if (arcMidPoints[a.IDA]) path.push(...arcMidPoints[a.IDA]);
            path.push([a.LONG_E, a.LAT_E]);

            jsondata.arcs.push({
                IDA: a.IDA, type: 'polyline',
                Name: a.NAME, Type: a.TYPE,
                FromNode: a.IDNB, ToNode: a.IDNE,
                PolyLeft: a.IDPOL, PolyRight: a.IDPOR,
                paths: [path]
            });
        });

        // Polygons: tái tạo hình dạng từ ARC_POINT của các cung bao quanh
        // Với mỗi polygon, lấy path của cung tương ứng để dựng rings
        const polyMap = {};
        polysResult.recordset.forEach(p => {
            if (!polyMap[p.IDPO]) {
                polyMap[p.IDPO] = { IDPO: p.IDPO, Name: p.NAME, Location: p.LOCATION, IDR: p.IDR, arcIds: [] };
            }
            polyMap[p.IDPO].arcIds.push(p.IDA);
        });

        Object.values(polyMap).forEach(poly => {
            // Gom tọa độ từ tất cả các cung của đa giác
            const ring = [];
            let lastPoint = null;

            poly.arcIds.forEach((arcId, index) => {
                const arcInfo = arcsResult.recordset.find(a => a.IDA === arcId);
                if (!arcInfo) return;
                
                let arcPath = [[arcInfo.LONG_S, arcInfo.LAT_S]];
                if (arcMidPoints[arcId]) arcPath.push(...arcMidPoints[arcId]);
                arcPath.push([arcInfo.LONG_E, arcInfo.LAT_E]);

                // Determine direction to connect to lastPoint
                if (lastPoint) {
                    const distS = Math.pow(arcPath[0][0] - lastPoint[0], 2) + Math.pow(arcPath[0][1] - lastPoint[1], 2);
                    const distE = Math.pow(arcPath[arcPath.length-1][0] - lastPoint[0], 2) + Math.pow(arcPath[arcPath.length-1][1] - lastPoint[1], 2);
                    if (distE < distS) {
                        arcPath.reverse();
                    }
                } else if (poly.arcIds.length > 1) {
                    // For the first arc, look ahead to the next arc to determine correct direction
                    const nextArcId = poly.arcIds[1];
                    const nextArcInfo = arcsResult.recordset.find(a => a.IDA === nextArcId);
                    if (nextArcInfo) {
                        let nextS = [nextArcInfo.LONG_S, nextArcInfo.LAT_S];
                        let nextE = [nextArcInfo.LONG_E, nextArcInfo.LAT_E];
                        let distE_to_nextS = Math.pow(arcPath[arcPath.length-1][0] - nextS[0], 2) + Math.pow(arcPath[arcPath.length-1][1] - nextS[1], 2);
                        let distE_to_nextE = Math.pow(arcPath[arcPath.length-1][0] - nextE[0], 2) + Math.pow(arcPath[arcPath.length-1][1] - nextE[1], 2);
                        
                        let distS_to_nextS = Math.pow(arcPath[0][0] - nextS[0], 2) + Math.pow(arcPath[0][1] - nextS[1], 2);
                        let distS_to_nextE = Math.pow(arcPath[0][0] - nextE[0], 2) + Math.pow(arcPath[0][1] - nextE[1], 2);
                        
                        // If Start is closer to next arc's endpoints than End, we need to reverse the first arc
                        if (Math.min(distS_to_nextS, distS_to_nextE) < Math.min(distE_to_nextS, distE_to_nextE)) {
                            arcPath.reverse();
                        }
                    }
                }

                if (index > 0 && arcPath.length > 0) {
                    arcPath.shift(); // remove overlapping point with previous arc
                }

                ring.push(...arcPath);
                if (ring.length > 0) {
                    lastPoint = ring[ring.length - 1];
                }
            });

            jsondata.polygons.push({
                IDPO: poly.IDPO, type: 'polygon',
                Name: poly.Name, Location: poly.Location, IDR: poly.IDR,
                rings: [ring]
            });
        });

        // Regions
        regionsResult.recordset.forEach(r => {
            jsondata.regions.push({ IDR: r.IDR, DESCRIPTION: r.DESCRIPTION });
        });

        res.json(jsondata);

    } catch (err) {
        console.error('Lỗi truy vấn SQL:', err);
        res.status(500).json({ error: 'Lỗi kết nối cơ sở dữ liệu' });
    }
});

// =============================================
// API /api/login: Đăng nhập admin
// =============================================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Thiếu username hoặc password' });
        }

        // Cảnh báo: Phải băm mật khẩu theo bảng mã UTF-16LE (utf16le) để khớp 
        // với hàm HASHBYTES('MD5', N'chuỗi') (dùng NVARCHAR) của SQL Server
        const hashedPass = crypto.createHash('md5').update(password, 'utf16le').digest('hex').toUpperCase();
        
        const pool = await poolPromise;
        const result = await pool.request()
            .input('username', sql.NVarChar, username)
            .input('pass', sql.VarChar, hashedPass)
            .query('SELECT ID FROM USERS WHERE USERNAME = @username AND PASS = @pass');

        if (result.recordset.length > 0) {
            // Generate a simple token (in a real app, use JWT)
            const token = crypto.randomBytes(16).toString('hex');
            res.json({ success: true, token: token });
        } else {
            res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu' });
        }
    } catch (err) {
        console.error('Lỗi login:', err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// =============================================
// API /api/execute-sql: Thực thi SQL từ frontend
// =============================================
app.post('/api/execute-sql', async (req, res) => {
    const { scriptLines } = req.body;
    if (!scriptLines || !Array.isArray(scriptLines) || scriptLines.length === 0) {
        return res.status(400).json({ success: false, message: 'Không có mã SQL nào để chạy.' });
    }
    try {
        const pool = await poolPromise;
        const fullScript = `
            BEGIN TRY
                BEGIN TRAN;
                ${scriptLines.join('\n')}
                COMMIT TRAN;
            END TRY
            BEGIN CATCH
                IF @@TRANCOUNT > 0 ROLLBACK TRAN;
                THROW;
            END CATCH
        `;
        await pool.request().query(fullScript);
        res.json({ success: true, message: 'Thực thi thành công.' });
    } catch (err) {
        const failedScript = scriptLines.join('\n');
        fs.writeFileSync(path.join(__dirname, 'failed_script.sql'), failedScript);
        console.error('Lỗi thực thi SQL (đã lưu vào failed_script.sql):', err.message);
        res.status(500).json({ success: false, message: err.message || 'Lỗi khi chạy SQL' });
    }
});

// =============================================
// API /api/export-sql: Xuất toàn bộ CSDL thành file .sql
// =============================================
app.get('/api/export-sql', async (req, res) => {
    try {
        const pool = await poolPromise;
        let sqlScript = "BEGIN TRANSACTION;\n\n";
        
        // Xóa cấu trúc cũ trước khi Restore
        sqlScript += "-- XÓA DỮ LIỆU CŨ TRƯỚC KHI RESTORE\n";
        sqlScript += "DELETE FROM TOPO_POLY_ARC;\n";
        sqlScript += "DELETE FROM TOPO_ARC_POINT;\n";
        sqlScript += "UPDATE TOPO_ARC SET IDPOL=NULL, IDPOR=NULL;\n";
        sqlScript += "DELETE FROM TOPO_ARC;\n";
        sqlScript += "DELETE FROM TOPO_POLY;\n";
        sqlScript += "DELETE FROM TOPO_NODE;\n";
        sqlScript += "DELETE FROM TOPO_POINT;\n";
        sqlScript += "DELETE FROM TOPO_REGION;\n\n";

        // Regions
        const reg = await pool.request().query('SELECT * FROM TOPO_REGION');
        if (reg.recordset.length > 0) {
            sqlScript += "-- RESTORE REGIONS\nSET IDENTITY_INSERT TOPO_REGION ON;\n";
            reg.recordset.forEach(r => {
                let desc = r.DESCRIPTION ? r.DESCRIPTION.replace(/'/g, "''") : '';
                sqlScript += `INSERT INTO TOPO_REGION (IDR, DESCRIPTION) VALUES (${r.IDR}, N'${desc}');\n`;
            });
            sqlScript += "SET IDENTITY_INSERT TOPO_REGION OFF;\n\n";
        }

        // Points
        const pts = await pool.request().query('SELECT * FROM TOPO_POINT');
        if (pts.recordset.length > 0) {
            sqlScript += "-- RESTORE POINTS\nSET IDENTITY_INSERT TOPO_POINT ON;\n";
            pts.recordset.forEach(p => {
                let name = p.NAME ? p.NAME.replace(/'/g, "''") : '';
                sqlScript += `INSERT INTO TOPO_POINT (IDP, LONG, LAT, IS_ISOLATED, NAME) VALUES (${p.IDP}, ${p.LONG}, ${p.LAT}, ${p.IS_ISOLATED ? 1 : 0}, N'${name}');\n`;
            });
            sqlScript += "SET IDENTITY_INSERT TOPO_POINT OFF;\n\n";
        }

        // Nodes
        const nodes = await pool.request().query('SELECT * FROM TOPO_NODE');
        if (nodes.recordset.length > 0) {
            sqlScript += "-- RESTORE NODES\nSET IDENTITY_INSERT TOPO_NODE ON;\n";
            nodes.recordset.forEach(n => {
                let name = n.NAME ? n.NAME.replace(/'/g, "''") : '';
                let cat = n.CATEGORY ? n.CATEGORY.replace(/'/g, "''") : '';
                sqlScript += `INSERT INTO TOPO_NODE (IDN, IDP, NAME, CATEGORY) VALUES (${n.IDN}, ${n.IDP}, N'${name}', N'${cat}');\n`;
            });
            sqlScript += "SET IDENTITY_INSERT TOPO_NODE OFF;\n\n";
        }

        // Polys
        const polys = await pool.request().query('SELECT * FROM TOPO_POLY');
        if (polys.recordset.length > 0) {
            sqlScript += "-- RESTORE POLYGONS\nSET IDENTITY_INSERT TOPO_POLY ON;\n";
            polys.recordset.forEach(p => {
                let idr = p.IDR ? p.IDR : 'NULL';
                let name = p.NAME ? p.NAME.replace(/'/g, "''") : '';
                let loc = p.LOCATION ? p.LOCATION.replace(/'/g, "''") : '';
                sqlScript += `INSERT INTO TOPO_POLY (IDPO, NAME, LOCATION, IDR) VALUES (${p.IDPO}, N'${name}', N'${loc}', ${idr});\n`;
            });
            sqlScript += "SET IDENTITY_INSERT TOPO_POLY OFF;\n\n";
        }

        // Arcs
        const arcs = await pool.request().query('SELECT * FROM TOPO_ARC');
        if (arcs.recordset.length > 0) {
            sqlScript += "-- RESTORE ARCS\nSET IDENTITY_INSERT TOPO_ARC ON;\n";
            arcs.recordset.forEach(a => {
                let pl = a.IDPOL ? a.IDPOL : 'NULL';
                let pr = a.IDPOR ? a.IDPOR : 'NULL';
                let name = a.NAME ? a.NAME.replace(/'/g, "''") : '';
                let type = a.TYPE ? a.TYPE.replace(/'/g, "''") : '';
                sqlScript += `INSERT INTO TOPO_ARC (IDA, IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) VALUES (${a.IDA}, ${a.IDNB}, ${a.IDNE}, ${pl}, ${pr}, N'${name}', N'${type}');\n`;
            });
            sqlScript += "SET IDENTITY_INSERT TOPO_ARC OFF;\n\n";
        }

        // Arc Points
        const ap = await pool.request().query('SELECT * FROM TOPO_ARC_POINT');
        if (ap.recordset.length > 0) {
            sqlScript += "-- RESTORE ARC POINTS\n";
            ap.recordset.forEach(a => {
                sqlScript += `INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES (${a.IDA}, ${a.IDP}, ${a.STT});\n`;
            });
            sqlScript += "\n";
        }

        // Poly Arcs
        const pa = await pool.request().query('SELECT * FROM TOPO_POLY_ARC');
        if (pa.recordset.length > 0) {
            sqlScript += "-- RESTORE POLY ARCS\n";
            pa.recordset.forEach(p => {
                sqlScript += `INSERT INTO TOPO_POLY_ARC (IDPO, IDA, STT) VALUES (${p.IDPO}, ${p.IDA}, ${p.STT});\n`;
            });
            sqlScript += "\n";
        }

        sqlScript += "COMMIT;\n";

        res.setHeader('Content-disposition', 'attachment; filename=topology_backup.sql');
        res.setHeader('Content-type', 'application/sql');
        res.send(sqlScript);

    } catch (err) {
        console.error('Lỗi xuất SQL:', err);
        res.status(500).send("Lỗi xuất dữ liệu SQL");
    }
});

app.listen(port, () => {
    console.log(`API Server Lab1-Topo đang chạy tại http://localhost:${port}`);
});
