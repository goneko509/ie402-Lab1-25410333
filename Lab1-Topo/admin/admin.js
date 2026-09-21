require([
    "esri/Map",
    "esri/views/MapView",
    "esri/Graphic",
    "esri/layers/GraphicsLayer",
    "esri/widgets/Sketch",
    "esri/geometry/support/webMercatorUtils",
    "esri/geometry/geometryEngine"
], function(Map, MapView, Graphic, GraphicsLayer, Sketch, webMercatorUtils, geometryEngine) {
    (async function() {
        try {
            // 1. Tải trạng thái và cấu hình
            const { AppState } = await import('./modules/state.js?v=10');
            
            // 2. Khởi tạo bản đồ
            const { initMap } = await import('./modules/mapInit.js?v=10');
            const { map, view, graphicsLayer, sketch } = initMap(Map, MapView, GraphicsLayer, Sketch);

            // 3. Quản lý UI
            const uiManager = await import('./modules/uiManager.js?v=10');

            // 4. Giao tiếp API và nạp dữ liệu
            const { refreshDashboardData } = await import('./modules/apiHandler.js?v=11');
            window.refreshDashboardData = () => refreshDashboardData(view, graphicsLayer, Graphic, AppState);
            window.loadData = window.refreshDashboardData;

            // 5. Khởi tạo các sự kiện giao diện (Lưu thuộc tính, Xuất SQL)
            const { initUIEvents } = await import('./modules/uiEvents.js?v=11');
            initUIEvents(AppState, webMercatorUtils, graphicsLayer, view);

            // 6. Khởi tạo các sự kiện vẽ (Sketch)
            const { initSketchEvents } = await import('./modules/sketchEvents.js?v=13');
            initSketchEvents(sketch, view, graphicsLayer, AppState, webMercatorUtils, geometryEngine, uiManager);

            // 7a. Dò tìm và tạo Polygon tự động
            const { initDetectPoly } = await import('./modules/spatialDetectPoly.js?v=10');
            initDetectPoly(view, graphicsLayer, Graphic, geometryEngine, webMercatorUtils, AppState, sketch);

            // 7b. Khởi tạo Bộ dựng Tô-pô tự động (Rebuild ARC/Topology)
            const { initRebuildArc } = await import('./modules/spatialRebuildArc.js?v=10');
            initRebuildArc(view, graphicsLayer, Graphic, geometryEngine, webMercatorUtils, AppState, sketch);

            // 7c. Khởi tạo Tái thiết Tô-pô Cục bộ bằng Lasso
            const { initSpatialRebuildLocal } = await import('./modules/spatialRebuildLocal.js?v=2');
            const rebuildLassoSketchVM = initSpatialRebuildLocal(view, graphicsLayer, webMercatorUtils, AppState, Graphic, geometryEngine, sketch);

            // 8. Khởi tạo chức năng Xóa không gian (Spatial Delete)
            const { initSpatialDelete } = await import('./modules/spatialDelete.js?v=11');

            // 9. Khởi tạo chức năng Tạo Vùng (Create Region)
            const { initCreateRegion } = await import('./modules/spatialCreateRegion.js?v=1');
            initCreateRegion(sketch, AppState);

            // 10. Khởi tạo module Số hóa từ dữ liệu Vector
            const { initLassoVectorizer } = await import('./modules/lassoVectorizer.js?v=3');
            initLassoVectorizer(view, graphicsLayer, Graphic, AppState, sketch, geometryEngine, webMercatorUtils);

            // 11. Khởi tạo module Xây dựng Polygon toàn cục
            const { initBuildPolygons } = await import('./modules/spatialBuildPolygons.js?v=11');
            initBuildPolygons(view, graphicsLayer, webMercatorUtils, AppState);

            // 12. Khởi tạo chức năng Thêm/Sửa/Xóa từ Tab
            uiManager.initCheckboxEvents();
            const { initTabOperations } = await import('./modules/tabOperations.js?v=1');
            initTabOperations(view, graphicsLayer, sketch, AppState);

            // Bootstrap tải dữ liệu ban đầu khi MapView đã sẵn sàng
            function initGlobalEvents() {
                // Xóa listener cũ nếu có và gán listener tập trung cho document
                document.removeEventListener("click", handleGlobalClick);
                document.addEventListener("click", handleGlobalClick);
            }

            function handleGlobalClick(e) {
                const target = e.target;

                // 1. Nút "Tải lại" / "Refresh"
                if (target.closest("#btnRefresh") || target.id === "btnRefresh") {
                    e.preventDefault();
                    if (window.refreshDashboardData) window.refreshDashboardData();
                    else if (window.loadData) window.loadData();
                    return;
                }

                // 1b. Nút "Khoanh vùng Rebuild" (Lasso)
                if (target.closest("#btnRebuildLasso") || target.id === "btnRebuildLasso") {
                    e.preventDefault();
                    if (window.rebuildLassoSketchVM) {
                        AppState.currentInteractionMode = "REBUILD_LASSO";
                        window.rebuildLassoSketchVM.create("polygon", { mode: "freehand" });
                        console.log("✏️ Bắt đầu vẽ Lasso chọn vùng tái thiết Tô-pô...");
                    } else {
                        alert("Công cụ Lasso Rebuild chưa sẵn sàng!");
                    }
                    return;
                }

                // 2. Nút "Chọn vùng xóa" (Lasso)
                if (target.closest("#btnSpatialDelete") || target.id === "btnSpatialDelete") {
                    e.preventDefault();
                    
                    // Cơ chế khởi tạo lại nếu window.deleteSketchVM chưa có
                    if (!window.deleteSketchVM && window.mapView && window.tempDeleteLayer) {
                        console.warn("⚠️ Khởi tạo lại deleteSketchVM...");
                        if (typeof initSpatialDelete === "function") {
                            initSpatialDelete(view, graphicsLayer, webMercatorUtils, AppState, sketch, geometryEngine);
                        }
                    }

                    if (window.deleteSketchVM) {
                        AppState.isSpatialDeleteMode = true;
                        AppState.currentInteractionMode = "DELETE_LASSO";
                        window.deleteSketchVM.create("polygon", { mode: "freehand" });
                        console.log("✏️ Bắt đầu vẽ Lasso chọn vùng xóa...");
                    } else {
                        alert("Công cụ chọn vùng chưa sẵn sàng! Vui lòng kiểm tra lại quá trình khởi tạo Bản đồ.");
                    }
                    return;
                }

                // 3. Click vào dòng item trong các Tab Sidebar
                const itemRow = target.closest("tr");
                if (itemRow && itemRow.id && itemRow.id.startsWith("row_")) {
                    // Logic highlight nếu cần thiết có thể xử lý ở đây
                    return;
                }
            }

            // Luồng khởi tạo chuẩn bất đồng bộ
            view.when(async () => {
                console.log("✅ MapView đã sẵn sàng! Bắt đầu tự động tải dữ liệu...");
                try {
                    // Step 1: Tự động tải dữ liệu từ CSDL và render lên Tab + Bản đồ
                    if (window.loadData) await window.loadData();
                    
                    // Step 2: Khởi tạo bộ lắng nghe sự kiện toàn cục
                    initGlobalEvents();

                    // Step 3: Khởi tạo công cụ chọn xóa SketchViewModel
                    if (typeof initSpatialDelete === "function") {
                        initSpatialDelete(view, graphicsLayer, webMercatorUtils, AppState, sketch, geometryEngine);
                    }
                    console.log("✅ Tự động khởi tạo Dashboard hoàn tất!");
                } catch (err) {
                    console.error("❌ Lỗi khi tự động nạp dữ liệu ban đầu:", err);
                }
            }).catch(err => {
                console.error("❌ Lỗi khởi tạo MapView:", err);
            });

            // 3. SỬA TƯƠNG TÁC CLICK TRÊN BẢN ĐỒ (view.on("click"))
            view.on("click", (event) => {
                view.hitTest(event).then((response) => {
                    if (response.results.length > 0) {
                        const graphic = response.results[0].graphic;
                        console.log("Đã click vào đối tượng trên bản đồ:", graphic.attributes);
                        // Hiển thị thông tin đối tượng hoặc highlight
                    }
                });
            });
        } catch (err) {
            console.error("Lỗi khởi tạo Dashboard chi tiết:", err);
        }
    })();
});
