USE [25410333_GISDB];
GO

-- Xóa bảng của bản nháp trước (Có ràng buộc khóa ngoại tới NODE)
IF OBJECT_ID('NETWORK_EDGE', 'U') IS NOT NULL DROP TABLE NETWORK_EDGE;

-- Xóa các bảng mới theo đúng thứ tự khóa ngoại
IF OBJECT_ID('NETWORK_POLY_POINT', 'U') IS NOT NULL DROP TABLE NETWORK_POLY_POINT;
IF OBJECT_ID('NETWORK_POLY', 'U') IS NOT NULL DROP TABLE NETWORK_POLY;
IF OBJECT_ID('NETWORK_REGION', 'U') IS NOT NULL DROP TABLE NETWORK_REGION;
IF OBJECT_ID('NETWORK_ARC_POINT', 'U') IS NOT NULL DROP TABLE NETWORK_ARC_POINT;
IF OBJECT_ID('NETWORK_ARC', 'U') IS NOT NULL DROP TABLE NETWORK_ARC;
IF OBJECT_ID('NETWORK_NODE', 'U') IS NOT NULL DROP TABLE NETWORK_NODE;
IF OBJECT_ID('NETWORK_POINT', 'U') IS NOT NULL DROP TABLE NETWORK_POINT;
GO

-- =============================================
-- 1. BẢNG POINT: LƯU TỌA ĐỘ
-- =============================================
CREATE TABLE NETWORK_POINT (
    IDP INT IDENTITY(1,1) PRIMARY KEY,
    LONG FLOAT NOT NULL,
    LAT FLOAT NOT NULL
);
GO

-- =============================================
-- 2. BẢNG NODE: NÚT MẠNG
-- =============================================
CREATE TABLE NETWORK_NODE (
    IDN INT IDENTITY(1,1) PRIMARY KEY,
    IDP INT NOT NULL,
    NAME NVARCHAR(255),
    CATEGORY NVARCHAR(100),
    FOREIGN KEY (IDP) REFERENCES NETWORK_POINT(IDP) ON DELETE CASCADE
);
GO

-- =============================================
-- 3. BẢNG ARC: CUNG (ĐƯỜNG GẤP KHÚC)
-- =============================================
CREATE TABLE NETWORK_ARC (
    IDA INT IDENTITY(1,1) PRIMARY KEY,
    IDNB INT NOT NULL, -- Node Bắt đầu
    IDNE INT NOT NULL, -- Node Kết thúc
    NAME NVARCHAR(255),
    TYPE NVARCHAR(100),
    FOREIGN KEY (IDNB) REFERENCES NETWORK_NODE(IDN),
    FOREIGN KEY (IDNE) REFERENCES NETWORK_NODE(IDN)
);
GO

-- =============================================
-- 4. BẢNG ARC_POINT: ĐIỂM TRUNG GIAN CỦA CUNG
-- =============================================
CREATE TABLE NETWORK_ARC_POINT (
    IDA INT NOT NULL,
    IDP INT NOT NULL,
    STT INT NOT NULL,
    PRIMARY KEY (IDA, IDP),
    FOREIGN KEY (IDA) REFERENCES NETWORK_ARC(IDA) ON DELETE CASCADE,
    FOREIGN KEY (IDP) REFERENCES NETWORK_POINT(IDP)
);
GO

-- =============================================
-- 5. BẢNG REGION: VÙNG
-- =============================================
CREATE TABLE NETWORK_REGION (
    IDR INT IDENTITY(1,1) PRIMARY KEY,
    DESCRIPTION NVARCHAR(500)
);
GO

-- =============================================
-- 6. BẢNG POLY: ĐA GIÁC
-- =============================================
CREATE TABLE NETWORK_POLY (
    IDPO INT IDENTITY(1,1) PRIMARY KEY,
    NAME NVARCHAR(255),
    LOCATION NVARCHAR(255),
    IDR INT NULL, -- Cho phép null nếu chưa thuộc vùng nào
    FOREIGN KEY (IDR) REFERENCES NETWORK_REGION(IDR)
);
GO

-- =============================================
-- 7. BẢNG POLY_POINT: TỌA ĐỘ KHÉP KÍN ĐA GIÁC
-- =============================================
CREATE TABLE NETWORK_POLY_POINT (
    IDPO INT NOT NULL,
    IDP INT NOT NULL,
    STT INT NOT NULL,
    PRIMARY KEY (IDPO, IDP),
    FOREIGN KEY (IDPO) REFERENCES NETWORK_POLY(IDPO) ON DELETE CASCADE,
    FOREIGN KEY (IDP) REFERENCES NETWORK_POINT(IDP)
);
GO

