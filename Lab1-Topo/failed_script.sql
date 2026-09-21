
BEGIN TRANSACTION;
-- [SỬA VỊ TRÍ] Arc ID=1001
DECLARE @OldPts_1001_2710 TABLE (IDP INT);
INSERT INTO @OldPts_1001_2710 SELECT IDP FROM TOPO_ARC_POINT WHERE IDA=1001;
DELETE FROM TOPO_ARC_POINT WHERE IDA=1001;
DELETE FROM TOPO_POINT WHERE IDP IN (SELECT IDP FROM @OldPts_1001_2710);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.773400) <= 0.000001 AND ABS(LAT - 10.853451) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_227100', 106.773400, 10.853451);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_227100 INT;
SELECT TOP 1 @UpdIDP_227100 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.773400) <= 0.000001 AND ABS(LAT - 10.853451) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_227100,1);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.773795) <= 0.000001 AND ABS(LAT - 10.852832) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_227101', 106.773795, 10.852832);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_227101 INT;
SELECT TOP 1 @UpdIDP_227101 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.773795) <= 0.000001 AND ABS(LAT - 10.852832) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_227101,2);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.774393) <= 0.000001 AND ABS(LAT - 10.851855) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_227102', 106.774393, 10.851855);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_227102 INT;
SELECT TOP 1 @UpdIDP_227102 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.774393) <= 0.000001 AND ABS(LAT - 10.851855) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_227102,3);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.774445) <= 0.000001 AND ABS(LAT - 10.851727) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_227103', 106.774445, 10.851727);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_227103 INT;
SELECT TOP 1 @UpdIDP_227103 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.774445) <= 0.000001 AND ABS(LAT - 10.851727) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_227103,4);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.774458) <= 0.000001 AND ABS(LAT - 10.851566) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_227104', 106.774458, 10.851566);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_227104 INT;
SELECT TOP 1 @UpdIDP_227104 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.774458) <= 0.000001 AND ABS(LAT - 10.851566) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_227104,5);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.774409) <= 0.000001 AND ABS(LAT - 10.851397) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_227105', 106.774409, 10.851397);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_227105 INT;
SELECT TOP 1 @UpdIDP_227105 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.774409) <= 0.000001 AND ABS(LAT - 10.851397) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_227105,6);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.774123) <= 0.000001 AND ABS(LAT - 10.850779) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_227106', 106.774123, 10.850779);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_227106 INT;
SELECT TOP 1 @UpdIDP_227106 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.774123) <= 0.000001 AND ABS(LAT - 10.850779) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_227106,7);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.773787) <= 0.000001 AND ABS(LAT - 10.850133) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_227107', 106.773787, 10.850133);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_227107 INT;
SELECT TOP 1 @UpdIDP_227107 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.773787) <= 0.000001 AND ABS(LAT - 10.850133) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_227107,8);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.773650) <= 0.000001 AND ABS(LAT - 10.849965) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_227108', 106.773650, 10.849965);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_227108 INT;
SELECT TOP 1 @UpdIDP_227108 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.773650) <= 0.000001 AND ABS(LAT - 10.849965) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_227108,9);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.773473) <= 0.000001 AND ABS(LAT - 10.849790) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_227109', 106.773473, 10.849790);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_227109 INT;
SELECT TOP 1 @UpdIDP_227109 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.773473) <= 0.000001 AND ABS(LAT - 10.849790) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_227109,10);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.773344) <= 0.000001 AND ABS(LAT - 10.849646) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_2271010', 106.773344, 10.849646);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_2271010 INT;
SELECT TOP 1 @UpdIDP_2271010 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.773344) <= 0.000001 AND ABS(LAT - 10.849646) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_2271010,11);
-- =============================================
-- BƯỚC 1: CHỈ THÊM ĐIỂM MỚI NẾU CHƯA TỒN TẠI TẠI TỌA ĐỘ NÀY
-- =============================================
IF NOT EXISTS (SELECT 1 FROM TOPO_POINT WHERE ABS(LONG - 106.773323) <= 0.000001 AND ABS(LAT - 10.849601) <= 0.000001)
BEGIN
    INSERT INTO TOPO_POINT (NAME, LONG, LAT) VALUES (N'Mid_Upd_2271011', 106.773323, 10.849601);
END;
-- =============================================
-- BƯỚC 2: TÁI SỬ DỤNG MÃ IDP CÓ SẴN/VỪA THÊM
-- =============================================
DECLARE @UpdIDP_2271011 INT;
SELECT TOP 1 @UpdIDP_2271011 = IDP FROM TOPO_POINT WHERE ABS(LONG - 106.773323) <= 0.000001 AND ABS(LAT - 10.849601) <= 0.000001;
INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (1001,@UpdIDP_2271011,12);
COMMIT;