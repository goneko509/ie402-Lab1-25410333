const fs = require('fs');
const sql = require('mssql');

const config = {
    user: 'sa',
    password: '123',
    server: 'localhost',
    database: 'GIS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function testFailedScript() {
    try {
        const pool = await sql.connect(config);
        const script = fs.readFileSync('D:/0. UIT/HK3/IE402.F31.CN1.CNTT - Hệ thống thông tin địa lý 3 chiều - Phan Thanh Vũ/LABs/25410333/Lab1-Topo/failed_script.sql', 'utf8');
        const fullScript = `
              BEGIN TRY
                  BEGIN TRAN;
                  ${script}
                  COMMIT TRAN;
              END TRY
              BEGIN CATCH
                  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
                  THROW;
              END CATCH
        `;
        await pool.request().query(fullScript);
        console.log("SUCCESS!");
    } catch (err) {
        console.error("ERROR CAUGHT:");
        console.error(err.message);
    } finally {
        process.exit(0);
    }
}
testFailedScript();
