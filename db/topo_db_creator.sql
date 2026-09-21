USE [25410333_GISDB];
GO

-- =============================================
-- XÓA BẢNG CŨ THEO ĐÚNG THỨ TỰ KHÓA NGOẠI
-- =============================================
IF OBJECT_ID('TOPO_POLY_ARC',   'U') IS NOT NULL DROP TABLE TOPO_POLY_ARC;
IF OBJECT_ID('TOPO_POLY',       'U') IS NOT NULL DROP TABLE TOPO_POLY;
IF OBJECT_ID('TOPO_REGION',     'U') IS NOT NULL DROP TABLE TOPO_REGION;
IF OBJECT_ID('TOPO_ARC_POINT',  'U') IS NOT NULL DROP TABLE TOPO_ARC_POINT;
IF OBJECT_ID('TOPO_ARC',        'U') IS NOT NULL DROP TABLE TOPO_ARC;
IF OBJECT_ID('TOPO_NODE',       'U') IS NOT NULL DROP TABLE TOPO_NODE;
IF OBJECT_ID('TOPO_POINT',      'U') IS NOT NULL DROP TABLE TOPO_POINT;
IF OBJECT_ID('USERS',           'U') IS NOT NULL DROP TABLE USERS;
GO

-- =============================================
-- 1. POINT(#IDP, X, Y)
-- =============================================
CREATE TABLE TOPO_POINT (
    IDP  INT IDENTITY(1,1) PRIMARY KEY,
    NAME NVARCHAR(255),
    LONG FLOAT NOT NULL,
    LAT  FLOAT NOT NULL
);
GO

-- =============================================
-- BẢNG USERS (Quản trị viên)
-- =============================================
CREATE TABLE USERS (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    USERNAME NVARCHAR(50) NOT NULL UNIQUE,
    PASS VARCHAR(32) NOT NULL,
    CREATED_AT DATETIME DEFAULT GETDATE()
);
GO

-- =============================================
-- 2. NODE(#IDN, IDP)
-- =============================================
CREATE TABLE TOPO_NODE (
    IDN      INT IDENTITY(1,1) PRIMARY KEY,
    IDP      INT NOT NULL,
    NAME     NVARCHAR(255),
    CATEGORY NVARCHAR(100),
    FOREIGN KEY (IDP) REFERENCES TOPO_POINT(IDP) ON DELETE CASCADE
);
GO

-- =============================================
-- 3. ARC(IDA, IDNB, IDNE, IDPOL, IDPOR)
--    IDPOL: ID đa giác bên trái cung (theo hướng đi của cung)
--    IDPOR: ID đa giác bên phải cung
--    NULL   = Đa giác ngoại (External Polygon / P0)
-- =============================================
CREATE TABLE TOPO_ARC (
    IDA   INT IDENTITY(1,1) PRIMARY KEY,
    IDNB  INT NOT NULL,           -- Node Bắt đầu
    IDNE  INT NOT NULL,           -- Node Kết thúc
    IDPOL INT NULL,               -- Poly bên Trái (NULL = ngoại)
    IDPOR INT NULL,               -- Poly bên Phải (NULL = ngoại)
    NAME  NVARCHAR(255),
    TYPE  NVARCHAR(100),
    FOREIGN KEY (IDNB) REFERENCES TOPO_NODE(IDN),
    FOREIGN KEY (IDNE) REFERENCES TOPO_NODE(IDN)
    -- IDPOL/IDPOR: FK sang TOPO_POLY sẽ thêm sau vì TOPO_POLY chưa tồn tại
);
GO

-- =============================================
-- 4. ARC_POINT(#IDA, #IDP)
--    Điểm hình học trung gian của Cung (thứ tự STT)
--    PK phức hợp (IDA, IDP) theo chuẩn lý thuyết
-- =============================================
CREATE TABLE TOPO_ARC_POINT (
    IDA INT NOT NULL,
    IDP INT NOT NULL,
    STT INT NOT NULL,
    PRIMARY KEY (IDA, IDP),
    FOREIGN KEY (IDA) REFERENCES TOPO_ARC(IDA) ON DELETE CASCADE,
    FOREIGN KEY (IDP) REFERENCES TOPO_POINT(IDP)
);
GO

-- =============================================
-- 5. REGION(#IDR, DESC)
-- =============================================
CREATE TABLE TOPO_REGION (
    IDR         INT IDENTITY(1,1) PRIMARY KEY,
    DESCRIPTION NVARCHAR(500)
);
GO

-- =============================================
-- 6. POLY(#IDPO, DESC, IDR)
--    Đa giác được định nghĩa GIÁN TIẾP qua các Cung bao quanh nó
-- =============================================
CREATE TABLE TOPO_POLY (
    IDPO     INT IDENTITY(1,1) PRIMARY KEY,
    NAME     NVARCHAR(255),
    LOCATION NVARCHAR(255),
    IDR      INT NULL,
    FOREIGN KEY (IDR) REFERENCES TOPO_REGION(IDR)
);
GO

-- =============================================
-- 7. POLY_ARC(#IDPO, #IDA)
--    Bảng trung gian: định nghĩa Đa giác bằng danh sách Cung bao quanh
--    PK phức hợp (IDPO, IDA) theo chuẩn lý thuyết
--    (KHÁC với Network: Network dùng POLY_POINT lưu tọa độ trực tiếp)
-- =============================================
CREATE TABLE TOPO_POLY_ARC (
    IDPO INT NOT NULL,
    IDA  INT NOT NULL,
    STT  INT NOT NULL,
    PRIMARY KEY (IDPO, IDA),
    FOREIGN KEY (IDPO) REFERENCES TOPO_POLY(IDPO) ON DELETE CASCADE,
    FOREIGN KEY (IDA)  REFERENCES TOPO_ARC(IDA)
);
GO
