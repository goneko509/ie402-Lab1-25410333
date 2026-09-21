USE [25410333_GISDB];
GO

-- =============================================
-- XÓA DỮ LIỆU CŨ VÀ RESET IDENTITY
-- =============================================
DELETE FROM TOPO_POLY_ARC;
DELETE FROM TOPO_POLY;
DELETE FROM TOPO_REGION;
DELETE FROM TOPO_ARC_POINT;
DELETE FROM TOPO_ARC;
DELETE FROM TOPO_NODE;
DELETE FROM TOPO_POINT;
DELETE FROM USERS;

DBCC CHECKIDENT ('TOPO_POLY',   RESEED, 0);
DBCC CHECKIDENT ('TOPO_REGION', RESEED, 0);
DBCC CHECKIDENT ('TOPO_ARC',    RESEED, 0);
DBCC CHECKIDENT ('TOPO_NODE',   RESEED, 0);
DBCC CHECKIDENT ('TOPO_POINT',  RESEED, 0);
DBCC CHECKIDENT ('USERS',       RESEED, 0);
GO

-- =============================================
-- THIẾT KẾ MÔ HÌNH TÔ-PÔ (TUÂN THỦ TUYỆT ĐỐI QUY ƯỚC TOPO)
-- CHỈ BAO GỒM 2 ĐA GIÁC: ĐH NÔNG LÂM VÀ ĐH TDTT CHIA SẺ CHUNG 1 CUNG
-- Xóa bỏ tất cả các điểm thừa (CNTT, KHTN, Cây xanh, Bóng đèn...)
-- =============================================

-- 1. POINT: Chỉ giữ lại 20 điểm hình học cấu thành nên Nông Lâm và TDTT
SET IDENTITY_INSERT TOPO_POINT ON;
INSERT INTO TOPO_POINT (IDP, NAME, LONG, LAT) VALUES
-- 2 Nút giao chung
(1, N'Đỉnh chung Tây', 106.79522769993694, 10.870537744603572),
(2, N'Đỉnh chung Đông', 106.79715889042772, 10.87039023614485),

-- Các điểm vòng ngoài của ĐH Nông Lâm (Phía Nam)
(3, N'Point 3', 106.79522769993694, 10.8687044200089),
(4, N'Point 4', 106.79466980046185, 10.866913229929262),
(5, N'Point 5', 106.7956139380351,  10.866618209355593),
(6, N'Point 6', 106.79672973698534, 10.866639282263392),
(7, N'Point 7', 106.79750221318164, 10.867018594349172),
(8, N'Point 8', 106.79733055180469, 10.867987945267126),
(9, N'Point 9', 106.7971374327556,  10.868156527714055),
(10, N'Point 10', 106.79741638249315, 10.868535837871478),
(11, N'Point 11', 106.79760950154225, 10.869589474667853),

-- Các điểm vòng ngoài của ĐH TDTT (Phía Bắc)
(12, N'Point 12', 106.7936398322001,  10.871528156651996),
(13, N'Point 13', 106.7935325438395,  10.871991752651327),
(14, N'Point 14', 106.79394023960977, 10.872834652622513),
(15, N'Point 15', 106.79469125813395, 10.873424681185172),
(16, N'Point 16', 106.79580705708419, 10.87348789846195),
(17, N'Point 17', 106.7960216338054,  10.87317181194409),
(18, N'Point 18', 106.79763095921437, 10.873045377243164),
(19, N'Point 19', 106.79773824757497, 10.872497492919857),
(20, N'Point 20', 106.798103028001,   10.871991752651327);
SET IDENTITY_INSERT TOPO_POINT OFF;
GO

-- 2. NODE: 2 nút hợp lệ
SET IDENTITY_INSERT TOPO_NODE ON;
INSERT INTO TOPO_NODE (IDN, IDP, NAME, CATEGORY) VALUES
(1, 1, N'Đỉnh chung 1 (Nông Lâm - TDTT)', N'Intersection Node'),
(2, 2, N'Đỉnh chung 2 (Nông Lâm - TDTT)', N'Intersection Node');
SET IDENTITY_INSERT TOPO_NODE OFF;
GO

-- 3. REGION: 1 vùng
SET IDENTITY_INSERT TOPO_REGION ON;
INSERT INTO TOPO_REGION (IDR, DESCRIPTION) VALUES
(1, N'Làng Đại Học Quốc Gia TP.HCM');
SET IDENTITY_INSERT TOPO_REGION OFF;
GO

-- 4. POLY: 2 đa giác hợp lệ
SET IDENTITY_INSERT TOPO_POLY ON;
INSERT INTO TOPO_POLY (IDPO, NAME, LOCATION, IDR) VALUES
(1, N'Đại học Nông Lâm', N'Khu phố 6, P.Linh Trung, Q.Thủ Đức, Tp.Hồ Chí Minh', 1),
(2, N'Đại học TDTT',     N'Khu phố 6, P.Linh Trung, Q.Thủ Đức, Tp.Hồ Chí Minh', 1);
SET IDENTITY_INSERT TOPO_POLY OFF;
GO

-- 5. ARC: 3 cung cấu thành Nông Lâm và TDTT
SET IDENTITY_INSERT TOPO_ARC ON;
INSERT INTO TOPO_ARC (IDA, IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) VALUES
-- Arc 1 (Node 2 -> Node 1): Cung chia sẻ đi từ Đông (2) sang Tây (1). Nông Lâm (Poly 1) ở bên Trái, TDTT (Poly 2) ở bên Phải.
(1, 2, 1, 1, 2,    N'Ranh giới chung Nông Lâm - TDTT', N'Shared Boundary'),
-- Arc 2 (Node 1 -> Node 2): Vòng ngoài Nông Lâm. Đi từ Tây sang Đông dọc bờ Nam. Nông Lâm (Poly 1) ở bên TRÁI.
(2, 1, 2, 1, NULL, N'Ranh giới ngoài ĐH Nông Lâm',     N'Boundary'),
-- Arc 3 (Node 1 -> Node 2): Vòng ngoài TDTT. Đi từ Tây sang Đông dọc bờ Bắc. TDTT (Poly 2) ở bên PHẢI.
(3, 1, 2, NULL, 2, N'Ranh giới ngoài ĐH TDTT',         N'Boundary');
SET IDENTITY_INSERT TOPO_ARC OFF;
GO

-- 6. ARC_POINT: Điểm trung gian
INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES
-- Arc 1 (Shared): Nối thẳng Node 2 (IDP 2) về Node 1 (IDP 1) -> Không có điểm trung gian

-- Arc 2 (Ranh giới ngoài Nông Lâm): 9 điểm (3-11)
(2, 3, 1), (2, 4, 2), (2, 5, 3), (2, 6, 4), (2, 7, 5),
(2, 8, 6), (2, 9, 7), (2, 10, 8), (2, 11, 9),

-- Arc 3 (Ranh giới ngoài TDTT): 9 điểm (12-20)
(3, 12, 1), (3, 13, 2), (3, 14, 3), (3, 15, 4), (3, 16, 5),
(3, 17, 6), (3, 18, 7), (3, 19, 8), (3, 20, 9);
GO

-- 7. POLY_ARC: Cấu trúc đa giác
INSERT INTO TOPO_POLY_ARC (IDPO, IDA, STT) VALUES
(1, 2, 1), -- Nông Lâm: Vòng ngoài (Arc 2: N1->N2)
(1, 1, 2), -- Nông Lâm: Ranh giới chung (Arc 1: N2->N1)
(2, 3, 1), -- TDTT: Vòng ngoài (Arc 3: N1->N2)
(2, 1, 2); -- TDTT: Ranh giới chung (Arc 1: N2->N1)
GO
