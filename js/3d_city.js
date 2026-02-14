class RealCityViewer {
    constructor() {
        this.statusEl = document.getElementById('cityStatus');
        this.queryInput = document.getElementById('cityQuery');
        this.searchBtn = document.getElementById('searchBtn');
        this.useCenterBtn = document.getElementById('useCenterBtn');
        this.downloadBuildingsBtn = document.getElementById('downloadBuildingsBtn');
        this.downloadDemBtn = document.getElementById('downloadDemBtn');
        this.downloadLandcoverBtn = document.getElementById('downloadLandcoverBtn');
        this.refreshPreviewBtn = document.getElementById('refreshPreviewBtn');
        this.previewHost = document.getElementById('cityPreview3D');

        this.map2d = null;
        this.marker = null;
        this.currentLngLat = [116.397428, 39.90923];

        this.cesiumViewer = null;
        this.osmBuildings = null;
        this.cesiumReady = false;

        this.openTopoKey = '4f898fb0e57e1ab990318877fce91aa9';
        this.cesiumToken = 'yJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiYzkzY2M2OC0zMWM5LTQ2OTUtOWNiYi04YjIzMDYzZGQ0MjciLCJpZCI6MzkwNTQ5LCJpYXQiOjE3NzEwNjE2NzR9.svIsO4YdKtVxfF7SwdmbA9oNyzY9cSFjPmNbywr-jIc';
        this.demType = 'SRTMGL1';
        this.demTemplate = 'https://portal.opentopography.org/API/globaldem?demtype={dem}&south={south}&north={north}&west={west}&east={east}&outputFormat=GTiff&API_Key={key}';
        this.landcoverWms = 'https://services.terrascope.be/wms/v2/wms';
        this.landcoverLayer = 'WORLDCOVER_2020_MAP';

        this.bindEvents();
        this.init();
    }

    async init() {
        this.initMap();
        this.applyCesiumToken();
        this.initPreview();
        this.schedulePreviewUpdate(true);
    }

    bindEvents() {
        if (this.searchBtn) {
            this.searchBtn.addEventListener('click', () => this.searchLocation());
        }
        if (this.useCenterBtn) {
            this.useCenterBtn.addEventListener('click', () => this.useCenterLocation());
        }
        if (this.queryInput) {
            this.queryInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.searchLocation();
                }
            });
        }
        if (this.downloadBuildingsBtn) {
            this.downloadBuildingsBtn.addEventListener('click', () => this.downloadBuildings());
        }
        if (this.downloadDemBtn) {
            this.downloadDemBtn.addEventListener('click', () => this.downloadDem());
        }
        if (this.downloadLandcoverBtn) {
            this.downloadLandcoverBtn.addEventListener('click', () => this.downloadLandcover());
        }
        if (this.refreshPreviewBtn) {
            this.refreshPreviewBtn.addEventListener('click', () => this.schedulePreviewUpdate(true));
        }
    }

    setStatus(text) {
        if (this.statusEl) {
            this.statusEl.textContent = text;
        }
    }

    async loadTokens() {}

    applyCesiumToken() {
        if (this.cesiumToken && window.Cesium) {
            Cesium.Ion.defaultAccessToken = this.cesiumToken;
            this.configureCesiumScene();
            if (this.cesiumViewer) {
                this.cesiumViewer.scene.requestRender();
            }
        } else if (window.Cesium && !this.cesiumToken) {
            this.setStatus('未读取到 cesiumIonToken');
        }
    }

    initMap() {
        if (!window.L) {
            this.setStatus('Leaflet 加载失败');
            return;
        }

        this.map2d = L.map('cityMap', {
            zoomControl: true,
            attributionControl: true
        }).setView([this.currentLngLat[1], this.currentLngLat[0]], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map2d);

        this.map2d.on('click', (e) => {
            this.setLocation([e.latlng.lng, e.latlng.lat], '地图选点');
        });

        this.map2d.on('moveend', () => {
            this.schedulePreviewUpdate();
        });

        this.setLocation(this.currentLngLat, '初始位置');
    }

    initPreview() {
        if (!this.previewHost || !window.Cesium) {
            return;
        }
        if (this.cesiumViewer) {
            return;
        }
        this.cesiumViewer = new Cesium.Viewer(this.previewHost, {
            timeline: false,
            animation: false,
            geocoder: false,
            homeButton: false,
            navigationHelpButton: false,
            baseLayerPicker: false,
            sceneModePicker: false,
            infoBox: true,
            selectionIndicator: true,
            fullscreenButton: false
        });
        this.configureCesiumScene();
        this.updatePreviewCamera();
    }

    async configureCesiumScene() {
        if (!this.cesiumViewer || !window.Cesium) {
            return;
        }
        try {
            this.cesiumViewer.scene.globe.depthTestAgainstTerrain = true;
            this.cesiumViewer.scene.globe.enableLighting = true;
            this.cesiumViewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
            this.cesiumViewer.terrainProvider = await Cesium.createWorldTerrainAsync();
            this.cesiumReady = true;
        } catch (err) {
            console.warn('Cesium 地形加载失败', err);
            this.cesiumViewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            this.setStatus('地形加载失败，已回退为椭球地形');
        }

        try {
            this.cesiumViewer.imageryLayers.removeAll();
            this.cesiumViewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({
                url: 'https://tile.openstreetmap.org/'
            }));
        } catch (err) {
            console.warn('底图加载失败', err);
        }

        if (!this.osmBuildings) {
            try {
                this.osmBuildings = await Cesium.createOsmBuildingsAsync();
                this.cesiumViewer.scene.primitives.add(this.osmBuildings);
            } catch (err) {
                console.warn('OSM Buildings 加载失败', err);
            }
        }

        if (!this.landcoverLayerAdded) {
            try {
                const provider = new Cesium.WebMapTileServiceImageryProvider({
                    url: 'https://services.terrascope.be/wmts/v2/wmts',
                    layer: this.landcoverLayer,
                    style: '',
                    format: 'image/png',
                    tileMatrixSetID: 'EPSG:3857'
                });
                const layer = this.cesiumViewer.imageryLayers.addImageryProvider(provider);
                layer.alpha = 0.6;
                this.landcoverLayerAdded = true;
            } catch (err) {
                console.warn('生态图层加载失败', err);
            }
        }
    }

    setLocation(lnglat, label) {
        this.currentLngLat = lnglat;
        const latlng = [lnglat[1], lnglat[0]];

        if (!this.marker) {
            this.marker = L.marker(latlng).addTo(this.map2d);
        } else {
            this.marker.setLatLng(latlng);
        }

        this.map2d.setView(latlng, this.map2d.getZoom(), { animate: true });
        this.setStatus(`已定位：${label} (${lnglat[0].toFixed(5)}, ${lnglat[1].toFixed(5)})`);
        this.schedulePreviewUpdate();
    }

    async searchLocation() {
        const keyword = (this.queryInput?.value || '').trim();
        if (!keyword) {
            this.setStatus('请输入中文地点');
            return;
        }

        this.setStatus(`搜索中：${keyword}`);

        try {
            const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=zh-CN&q=${encodeURIComponent(keyword)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!Array.isArray(data) || data.length === 0) {
                this.setStatus(`未找到地点：${keyword}`);
                return;
            }

            const item = data[0];
            const lnglat = [parseFloat(item.lon), parseFloat(item.lat)];
            this.setLocation(lnglat, item.display_name || keyword);
        } catch (err) {
            console.error(err);
            this.setStatus('搜索失败，请稍后重试');
        }
    }

    useCenterLocation() {
        if (!this.map2d) {
            return;
        }
        const c = this.map2d.getCenter();
        this.setLocation([c.lng, c.lat], '视图中心');
    }

    schedulePreviewUpdate(force) {
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
        }
        const delay = force ? 0 : 350;
        this._previewTimer = setTimeout(() => {
            this.updatePreviewCamera();
        }, delay);
    }

    updatePreviewCamera() {
        if (!this.cesiumViewer || !window.Cesium) {
            return;
        }
        const bbox = this.getBBox();
        if (!bbox) {
            return;
        }
        const rectangle = Cesium.Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north);
        this.cesiumViewer.camera.flyTo({
            destination: rectangle,
            duration: 1.2
        });
    }

    getBBox() {
        if (!this.map2d) {
            return null;
        }
        const b = this.map2d.getBounds();
        return {
            south: b.getSouth(),
            west: b.getWest(),
            north: b.getNorth(),
            east: b.getEast()
        };
    }

    formatBBox(bbox) {
        return {
            south: bbox.south.toFixed(6),
            north: bbox.north.toFixed(6),
            west: bbox.west.toFixed(6),
            east: bbox.east.toFixed(6)
        };
    }

    buildDemUrl(bbox) {
        if (!this.demTemplate) {
            return '';
        }
        const fmt = this.formatBBox(bbox);
        return this.demTemplate
            .replace('{dem}', encodeURIComponent(this.demType))
            .replace('{south}', encodeURIComponent(fmt.south))
            .replace('{north}', encodeURIComponent(fmt.north))
            .replace('{west}', encodeURIComponent(fmt.west))
            .replace('{east}', encodeURIComponent(fmt.east))
            .replace('{key}', encodeURIComponent(this.openTopoKey));
    }

    buildLandcoverUrl(bbox) {
        const fmt = this.formatBBox(bbox);
        const params = [
            'service=WMS',
            'request=GetMap',
            'version=1.1.1',
            'layers=' + encodeURIComponent(this.landcoverLayer),
            'styles=',
            'format=image/png',
            'transparent=true',
            'srs=EPSG:4326',
            `bbox=${fmt.west},${fmt.south},${fmt.east},${fmt.north}`,
            'width=2048',
            'height=2048'
        ];
        return `${this.landcoverWms}?${params.join('&')}`;
    }

    async downloadDem() {
        const bbox = this.getBBox();
        if (!bbox) {
            this.setStatus('无法获取下载范围');
            return;
        }
        if (!this.openTopoKey) {
            this.setStatus('缺少 OpenTopography API Key');
            return;
        }
        const url = this.buildDemUrl(bbox);
        if (!url) {
            this.setStatus('DEM 下载 URL 模板为空');
            return;
        }
        this.setStatus('已生成 DEM 下载链接');
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.click();
    }

    async downloadLandcover() {
        const bbox = this.getBBox();
        if (!bbox) {
            this.setStatus('无法获取下载范围');
            return;
        }
        const url = this.buildLandcoverUrl(bbox);
        this.setStatus('已生成生态图下载链接');
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.click();
    }

    parseHeight(tags, id) {
        if (tags && tags.height) {
            const h = parseFloat(String(tags.height).replace(/[^\d.]/g, ''));
            if (Number.isFinite(h) && h > 1) {
                return Math.min(220, h);
            }
        }
        if (tags && tags['building:levels']) {
            const lv = parseFloat(String(tags['building:levels']).replace(/[^\d.]/g, ''));
            if (Number.isFinite(lv) && lv > 0) {
                return Math.min(220, lv * 3.2);
            }
        }
        const fallback = 10 + (id % 9) * 4;
        return fallback;
    }

    async downloadBuildings() {
        const bbox = this.getBBox();
        if (!bbox) {
            this.setStatus('无法获取下载范围');
            return;
        }

        const fmt = this.formatBBox(bbox);
        const query = `
[out:json][timeout:25];
(
  way["building"](${fmt.south},${fmt.west},${fmt.north},${fmt.east});
  way["building:part"](${fmt.south},${fmt.west},${fmt.north},${fmt.east});
);
out geom tags;
`;

        this.setStatus('正在下载建筑数据...');

        try {
            const res = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: query.trim()
            });
            const data = await res.json();
            const elements = Array.isArray(data.elements) ? data.elements : [];

            const features = elements
                .filter(el => el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 3)
                .map(el => {
                    const coords = el.geometry.map(p => [p.lon, p.lat]);
                    if (coords.length > 0) {
                        const first = coords[0];
                        const last = coords[coords.length - 1];
                        if (first[0] !== last[0] || first[1] !== last[1]) {
                            coords.push(first);
                        }
                    }
                    return {
                        type: 'Feature',
                        properties: Object.assign({ id: el.id }, el.tags || {}),
                        geometry: {
                            type: 'Polygon',
                            coordinates: [coords]
                        }
                    };
                });

            const collection = {
                type: 'FeatureCollection',
                features
            };

            const name = `buildings_${fmt.south}_${fmt.west}_${fmt.north}_${fmt.east}.geojson`;
            this.downloadBlob(name, new Blob([JSON.stringify(collection, null, 2)], { type: 'application/geo+json' }));
            this.setStatus(`建筑数据已下载：${features.length} 条`);
        } catch (err) {
            console.error(err);
            this.setStatus('建筑数据下载失败，可能是网络限流');
        }
    }

    downloadBlob(name, blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new RealCityViewer();
});
