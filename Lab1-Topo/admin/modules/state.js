/**
 * @module state
 * @description Quản lý trạng thái (global state) của ứng dụng admin trong suốt phiên làm việc.
 * Đầu ra: Đối tượng quản lý tập trung các biến toàn cục để tránh xung đột giữa các chức năng.
 */
export const AppState = {
    currentInteractionMode: "NONE", // Các giá trị: "NONE", "DELETE_LASSO", "REBUILD_LASSO", "DRAW_OBJECT", ...
    isSpatialDeleteMode: false,
    isSpatialDetectPolyMode: false,
    isSpatialCreateRegionMode: false,
    isSpatialRebuildLassoMode: false,
    spatialDeleteGeometry: null,
    currentSelectionState: { points: [], arcs: [], polys: [], graphics: [] },
    sqlScriptLines: [],
    currentNewGraphic: null,
    maxIdP: 1000,
    maxIdA: 1000,
    maxIdPo: 1000,

    resetSelection() {
        this.currentSelectionState = { points: [], arcs: [], polys: [], graphics: [] };
    },
    addSqlLine(line) {
        this.sqlScriptLines.push(line);
    },
    clearSqlLines() {
        this.sqlScriptLines = [];
    }
};
