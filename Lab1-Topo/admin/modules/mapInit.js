/**
 * @module mapInit
 * @description Khởi tạo bản đồ, các lớp đồ họa và công cụ vẽ (Sketch).
 * Điều kiện đầu ra: Trả về đối tượng view, graphicsLayer, sketch đã gắn lên map để các module khác thao tác.
 */
export function initMap(Map, MapView, GraphicsLayer, Sketch) {
    const map = new Map({ basemap: "topo-vector" });
    const view = new MapView({
        container: "viewDiv",
        map: map,
        center: [106.770530, 10.852123], 
        zoom: 15
    });

    const graphicsLayer = new GraphicsLayer();
    map.add(graphicsLayer);

    const sketch = new Sketch({
        layer: graphicsLayer,
        view: view,
        creationMode: "update",
        availableCreateTools: ["point", "polyline", "polygon"],
        snappingOptions: {
            enabled: true,
            featureSources: [{ layer: graphicsLayer, enabled: true }]
        },
        defaultCreateOptions: {
            mode: "click" // Tắt chế độ vẽ freehand (kéo chuột thả ra sinh hàng trăm điểm)
        }
    });
    view.ui.add(sketch, "top-right");

    return { map, view, graphicsLayer, sketch };
}
