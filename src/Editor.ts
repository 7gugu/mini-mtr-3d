import { RailSystemData, TrackGeometry, LngLat, TrainTrip, TrackPoint } from './types/RailData';
import { railData } from './data';

export class Editor {
    map: AMap.Map;
    AMap: any;
    isEditing: boolean = false;
    
    activePolyline: any | null = null;
    activeEditor: any | null = null;
    currentTrackId: string | null = null;

    container: HTMLElement;
    contentContainer: HTMLElement;
    tabContainer: HTMLElement;
    activeTab: 'tracks' | 'schedule' = 'tracks';

    onDataUpdate: (() => void) | null = null;

    constructor(map: AMap.Map, AMap: any) {
        this.map = map;
        this.AMap = AMap;
        this.createUI();
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.className = 'ui-panel'; // Use new class
        this.container.style.position = 'absolute';
        this.container.style.top = '20px';
        this.container.style.right = '20px';
        this.container.style.width = '360px';
        this.container.style.maxHeight = '85vh';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.container.style.zIndex = '1000';

        // Header
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '16px';
        
        const title = document.createElement('h3');
        title.textContent = 'Rail Editor';
        header.appendChild(title);
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'ui-button';
        toggleBtn.textContent = 'Edit Mode';
        toggleBtn.onclick = () => {
            this.toggleEditMode();
            toggleBtn.classList.toggle('active');
        };
        header.appendChild(toggleBtn);
        this.container.appendChild(header);

        // Tab Container
        this.tabContainer = document.createElement('div');
        this.tabContainer.className = 'ui-tabs';
        this.tabContainer.style.display = 'none'; 
        this.tabContainer.innerHTML = `
            <button id="tab-tracks" class="ui-tab-btn active">Tracks</button>
            <button id="tab-schedule" class="ui-tab-btn">Schedule</button>
        `;
        this.container.appendChild(this.tabContainer);

        // Content Container
        this.contentContainer = document.createElement('div');
        this.contentContainer.className = 'ui-scroll-container';
        this.contentContainer.style.display = 'none'; 
        this.contentContainer.style.flex = '1';
        this.contentContainer.style.overflowY = 'auto';
        this.container.appendChild(this.contentContainer);

        // Footer Actions
        const footer = document.createElement('div');
        footer.style.marginTop = '16px';
        footer.style.paddingTop = '16px';
        footer.style.borderTop = '1px solid rgba(255,255,255,0.1)';
        footer.style.display = 'flex';
        footer.style.gap = '8px';
        
        const exportBtn = document.createElement('button');
        exportBtn.className = 'ui-button';
        exportBtn.textContent = 'Log JSON';
        exportBtn.style.flex = '1';
        exportBtn.onclick = () => {
            console.log(JSON.stringify(railData, null, 2));
            alert('Data logged to console (Pretty)');
        };
        footer.appendChild(exportBtn);

        const whistleBtn = document.createElement('button');
        whistleBtn.className = 'ui-button';
        whistleBtn.textContent = 'Whistle JSON';
        whistleBtn.style.flex = '1';
        whistleBtn.title = 'Log minified JSON for Whistle mock';
        whistleBtn.onclick = () => {
            console.log(JSON.stringify(railData));
            alert('Data logged to console (Minified for Whistle)');
        };
        footer.appendChild(whistleBtn);

        const resetBtn = document.createElement('button');
        resetBtn.className = 'ui-button danger';
        resetBtn.textContent = 'Reset Data';
        resetBtn.style.flex = '1';
        resetBtn.onclick = () => {
            if(confirm('Clear local storage and reset data?')) {
                localStorage.removeItem('railData_mtr_v3');
                location.reload();
            }
        };
        footer.appendChild(resetBtn);

        this.container.appendChild(footer);

        document.body.appendChild(this.container);
        
        this.container.querySelector('#tab-tracks')!.addEventListener('click', () => this.switchTab('tracks'));
        this.container.querySelector('#tab-schedule')!.addEventListener('click', () => this.switchTab('schedule'));
    }

    toggleEditMode() {
        this.isEditing = !this.isEditing;
        
        if (this.isEditing) {
            this.tabContainer.style.display = 'flex';
            this.contentContainer.style.display = 'block';
            this.switchTab(this.activeTab);
        } else {
            this.tabContainer.style.display = 'none';
            this.contentContainer.style.display = 'none';
            this.stopEditingTrack();
        }
    }

    switchTab(tab: 'tracks' | 'schedule') {
        this.activeTab = tab;
        this.contentContainer.innerHTML = ''; 
        
        // Update Tab Styles
        const trackBtn = this.container.querySelector('#tab-tracks')!;
        const scheduleBtn = this.container.querySelector('#tab-schedule')!;
        
        if (tab === 'tracks') {
            trackBtn.classList.add('active');
            scheduleBtn.classList.remove('active');
            this.renderTracksUI();
        } else {
            scheduleBtn.classList.add('active');
            trackBtn.classList.remove('active');
            this.stopEditingTrack(); 
            this.renderScheduleUI();
        }
    }

    saveToLocalStorage() {
        localStorage.setItem('railData_mtr_v3', JSON.stringify(railData));
    }

    triggerUpdate() {
        this.saveToLocalStorage();
        if (this.onDataUpdate) this.onDataUpdate();
    }

    // --- Tracks UI ---
    renderTracksUI() {
        this.contentContainer.innerHTML = '';
        const wrapper = document.createElement('div');
        
        const selectLabel = document.createElement('label');
        selectLabel.textContent = 'Select Track';
        selectLabel.style.display = 'block';
        selectLabel.style.marginBottom = '6px';
        selectLabel.style.fontSize = '12px';
        selectLabel.style.color = '#94a3b8';
        wrapper.appendChild(selectLabel);

        const select = document.createElement('select');
        select.className = 'ui-select';
        
        Object.keys(railData.tracks).forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = id;
            select.appendChild(opt);
        });
        
        select.onchange = (e) => {
            this.startEditingTrack((e.target as HTMLSelectElement).value);
        };
        
        if (this.currentTrackId) select.value = this.currentTrackId;
        wrapper.appendChild(select);

        // Point List Container
        const pointListDiv = document.createElement('div');
        pointListDiv.id = 'point-list';
        pointListDiv.className = 'ui-scroll-container';
        pointListDiv.style.maxHeight = '400px';
        pointListDiv.style.overflowY = 'auto';
        pointListDiv.style.background = 'rgba(0,0,0,0.2)';
        pointListDiv.style.borderRadius = '6px';
        pointListDiv.style.marginTop = '12px';
        wrapper.appendChild(pointListDiv);

        this.contentContainer.appendChild(wrapper);

        if (!this.currentTrackId && Object.keys(railData.tracks).length > 0) {
            this.startEditingTrack(Object.keys(railData.tracks)[0]);
            select.value = this.currentTrackId!;
        } else if (this.currentTrackId) {
            this.renderPointList();
        }
    }

    renderPointList() {
        const container = this.contentContainer.querySelector('#point-list');
        if (!container || !this.currentTrackId) return;
        
        container.innerHTML = '';
        const track = railData.tracks[this.currentTrackId];
        
        track.path.forEach((pt, idx) => {
            const row = document.createElement('div');
            row.className = 'ui-list-item';
            row.style.display = 'flex';
            row.style.gap = '8px';

            // Index
            const idxSpan = document.createElement('span');
            idxSpan.textContent = `#${idx}`;
            idxSpan.style.width = '24px';
            idxSpan.style.fontSize = '12px';
            idxSpan.style.color = '#64748b';
            row.appendChild(idxSpan);

            // Name
            const nameInput = document.createElement('input');
            nameInput.className = 'ui-input';
            nameInput.style.marginBottom = '0';
            nameInput.placeholder = 'Point Name';
            nameInput.style.flex = '2';
            nameInput.value = pt.name || '';
            nameInput.onchange = (e) => {
                pt.name = (e.target as HTMLInputElement).value;
                this.triggerUpdate();
            };
            row.appendChild(nameInput);

            // Coords Group (Stacked)
            const coordGroup = document.createElement('div');
            coordGroup.style.display = 'flex';
            coordGroup.style.flexDirection = 'column';
            coordGroup.style.gap = '4px';
            coordGroup.style.flex = '1';

            const lngInput = document.createElement('input');
            lngInput.className = 'ui-input';
            lngInput.style.marginBottom = '0';
            lngInput.style.padding = '4px';
            lngInput.style.fontSize = '11px';
            lngInput.type = 'number';
            lngInput.step = '0.00001';
            lngInput.value = pt.location[0].toString();
            lngInput.onchange = (e) => {
                pt.location[0] = parseFloat((e.target as HTMLInputElement).value);
                this.updatePolylineFromData();
                this.triggerUpdate();
            };
            coordGroup.appendChild(lngInput);

            const latInput = document.createElement('input');
            latInput.className = 'ui-input';
            latInput.style.marginBottom = '0';
            latInput.style.padding = '4px';
            latInput.style.fontSize = '11px';
            latInput.type = 'number';
            latInput.step = '0.00001';
            latInput.value = pt.location[1].toString();
            latInput.onchange = (e) => {
                pt.location[1] = parseFloat((e.target as HTMLInputElement).value);
                this.updatePolylineFromData();
                this.triggerUpdate();
            };
            coordGroup.appendChild(latInput);

            row.appendChild(coordGroup);

            // Delete Btn
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '×';
            delBtn.className = 'ui-button danger';
            delBtn.style.padding = '4px 8px';
            delBtn.style.height = 'fit-content';
            delBtn.style.alignSelf = 'center';
            delBtn.onclick = () => {
                track.path.splice(idx, 1);
                this.updatePolylineFromData();
                this.renderPointList();
                this.triggerUpdate();
            };
            row.appendChild(delBtn);

            container.appendChild(row);
        });

        // Add Point Button
        const addBtn = document.createElement('button');
        addBtn.className = 'ui-button primary';
        addBtn.textContent = '+ Add Point';
        addBtn.style.width = '100%';
        addBtn.style.marginTop = '8px';
        addBtn.onclick = () => {
            const last = track.path[track.path.length - 1];
            const newLoc: LngLat = last ? [last.location[0] + 0.001, last.location[1] + 0.001] : [114.0, 22.6];
            track.path.push({ location: newLoc });
            this.updatePolylineFromData();
            this.renderPointList();
            this.triggerUpdate();
        };
        container.appendChild(addBtn);
    }

    startEditingTrack(trackId: string) {
        this.stopEditingTrack(); 
        this.currentTrackId = trackId;
        const track = railData.tracks[trackId];
        if (!track) return;

        const path = track.path.map(p => p.location);
        this.activePolyline = new this.AMap.Polyline({
            path: path,
            strokeColor: "#3b82f6", // Matches UI primary color
            strokeWeight: 6,
            strokeOpacity: 0.8,
            zIndex: 200,
            bubble: true
        });

        this.map.add(this.activePolyline);

        this.renderPointList();

        if (!this.AMap.PolylineEditor) return;
        this.activeEditor = new this.AMap.PolylineEditor(this.map, this.activePolyline);
        this.activeEditor.open();

        this.activeEditor.on('addnode', (e: any) => this.syncDataFromPolyline());
        this.activeEditor.on('removenode', (e: any) => this.syncDataFromPolyline());
        this.activeEditor.on('adjust', (e: any) => this.syncDataFromPolyline());
    }

    syncDataFromPolyline() {
        if (!this.currentTrackId || !this.activePolyline) return;
        const newPath = this.activePolyline.getPath(); 
        const track = railData.tracks[this.currentTrackId];

        const newTrackPoints: TrackPoint[] = newPath.map((p: any, i: number) => {
            const existing = track.path[i];
            return {
                location: [p.getLng(), p.getLat()],
                name: existing ? existing.name : undefined
            };
        });
        
        track.path = newTrackPoints;
        this.renderPointList();
        this.triggerUpdate();
    }

    updatePolylineFromData() {
        if (!this.currentTrackId || !this.activePolyline) return;
        const track = railData.tracks[this.currentTrackId];
        const path = track.path.map(p => p.location);
        this.activePolyline.setPath(path);
        if (this.activeEditor) {
            this.activeEditor.close();
            this.activeEditor.open();
        }
    }

    stopEditingTrack() {
        if (this.activeEditor) {
            this.activeEditor.close();
            this.activeEditor = null;
        }
        if (this.activePolyline) {
            this.map.remove(this.activePolyline);
            this.activePolyline = null;
        }
        this.currentTrackId = null;
    }

    // --- Schedule UI ---
    renderScheduleUI() {
        this.contentContainer.innerHTML = '';
        const wrapper = document.createElement('div');
        
        const listContainer = document.createElement('div');
        listContainer.className = 'ui-scroll-container';
        listContainer.style.maxHeight = '400px';
        listContainer.style.overflowY = 'auto';
        listContainer.style.background = 'rgba(0,0,0,0.2)';
        listContainer.style.borderRadius = '6px';
        listContainer.style.marginBottom = '12px';

        railData.trips.forEach((trip, index) => {
            const item = document.createElement('div');
            item.className = 'ui-list-item';
            
            const info = document.createElement('span');
            const startTime = new Date(trip.legs[0]?.departureTime || 0).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            info.innerHTML = `<strong style="color:#fff">${trip.trainId}</strong> <span style="color:#94a3b8; font-size:12px">(${startTime})</span>`;
            item.appendChild(info);
            
            const btnGroup = document.createElement('div');
            btnGroup.style.display = 'flex';
            btnGroup.style.gap = '4px';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'ui-button';
            editBtn.style.padding = '4px 8px';
            editBtn.textContent = 'Edit';
            editBtn.onclick = () => this.renderTripForm(index);
            btnGroup.appendChild(editBtn);
            
            const delBtn = document.createElement('button');
            delBtn.className = 'ui-button danger';
            delBtn.style.padding = '4px 8px';
            delBtn.textContent = 'Del';
            delBtn.onclick = () => {
                if(confirm('Delete ' + trip.trainId + '?')) {
                    railData.trips.splice(index, 1);
                    this.triggerUpdate();
                    this.renderScheduleUI(); 
                }
            };
            btnGroup.appendChild(delBtn);
            
            item.appendChild(btnGroup);
            listContainer.appendChild(item);
        });

        wrapper.appendChild(listContainer);

        const addBtn = document.createElement('button');
        addBtn.className = 'ui-button primary';
        addBtn.textContent = '+ Add New Trip';
        addBtn.style.width = '100%';
        addBtn.onclick = () => {
            const newTrip: TrainTrip = {
                trainId: `G${Date.now().toString().slice(-4)}`,
                legs: []
            };
            railData.trips.push(newTrip);
            this.renderTripForm(railData.trips.length - 1);
        };
        wrapper.appendChild(addBtn);

        this.contentContainer.appendChild(wrapper);
    }

    renderTripForm(tripIndex: number) {
        this.contentContainer.innerHTML = ''; 
        const trip = railData.trips[tripIndex];
        
        const wrapper = document.createElement('div');
        
        const backBtn = document.createElement('button');
        backBtn.className = 'ui-button';
        backBtn.style.marginBottom = '12px';
        backBtn.textContent = '← Back to List';
        backBtn.onclick = () => this.renderScheduleUI();
        wrapper.appendChild(backBtn);

        const idRow = document.createElement('div');
        idRow.style.marginBottom = '16px';
        
        const label = document.createElement('div');
        label.textContent = 'Train ID';
        label.style.fontSize = '12px';
        label.style.color = '#94a3b8';
        label.style.marginBottom = '4px';
        idRow.appendChild(label);

        const idInput = document.createElement('input');
        idInput.className = 'ui-input';
        idInput.style.fontSize = '16px';
        idInput.style.fontWeight = 'bold';
        idInput.type = 'text';
        idInput.value = trip.trainId;
        idInput.onchange = (e) => {
            trip.trainId = (e.target as HTMLInputElement).value;
            this.triggerUpdate();
        };
        idRow.appendChild(idInput);
        wrapper.appendChild(idRow);

        // Legs Section
        const legsContainer = document.createElement('div');
        const renderLegs = () => {
            legsContainer.innerHTML = '<h4 style="margin:0 0 8px 0; font-size:14px; color:#94a3b8">Legs</h4>';
            trip.legs.forEach((leg, idx) => {
                const legDiv = document.createElement('div');
                legDiv.style.background = 'rgba(255,255,255,0.05)';
                legDiv.style.borderRadius = '6px';
                legDiv.style.padding = '10px';
                legDiv.style.marginBottom = '8px';
                
                // Track Selector
                const trackSel = document.createElement('select');
                trackSel.className = 'ui-select';
                Object.keys(railData.tracks).forEach(tid => {
                    const opt = document.createElement('option');
                    opt.value = tid;
                    opt.textContent = tid;
                    if(tid === leg.trackId) opt.selected = true;
                    trackSel.appendChild(opt);
                });
                trackSel.onchange = (e) => {
                    leg.trackId = (e.target as HTMLSelectElement).value;
                    this.triggerUpdate();
                };
                legDiv.appendChild(trackSel);

                // Time Inputs
                const tsToVal = (ts: number) => {
                    const d = new Date(ts);
                    // Adjust to local ISO string for input
                    // This quick hack accounts for timezone offset
                    const tzOffset = d.getTimezoneOffset() * 60000;
                    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
                };
                
                const valToTs = (val: string) => new Date(val).getTime();

                const timeGrid = document.createElement('div');
                timeGrid.style.display = 'grid';
                timeGrid.style.gridTemplateColumns = '1fr 1fr';
                timeGrid.style.gap = '8px';
                timeGrid.style.marginTop = '8px';
                
                const createTimeInput = (label: string, val: number, onChange: (ts: number) => void) => {
                    const d = document.createElement('div');
                    const l = document.createElement('div');
                    l.textContent = label;
                    l.style.fontSize = '11px';
                    l.style.color = '#94a3b8';
                    d.appendChild(l);
                    const inp = document.createElement('input');
                    inp.className = 'ui-input';
                    inp.style.marginBottom = '0';
                    inp.type = 'datetime-local';
                    inp.value = tsToVal(val);
                    inp.onchange = (e) => onChange(valToTs((e.target as HTMLInputElement).value));
                    d.appendChild(inp);
                    return d;
                };

                timeGrid.appendChild(createTimeInput('Departure', leg.departureTime, (ts) => {
                    leg.departureTime = ts;
                    this.triggerUpdate();
                }));

                timeGrid.appendChild(createTimeInput('Arrival', leg.arrivalTime, (ts) => {
                    leg.arrivalTime = ts;
                    this.triggerUpdate();
                }));

                legDiv.appendChild(timeGrid);
                
                const rmBtn = document.createElement('button');
                rmBtn.className = 'ui-button danger';
                rmBtn.textContent = 'Remove Leg';
                rmBtn.style.marginTop = '8px';
                rmBtn.style.width = '100%';
                rmBtn.style.fontSize = '12px';
                rmBtn.style.padding = '4px';
                rmBtn.onclick = () => {
                    trip.legs.splice(idx, 1);
                    renderLegs();
                    this.triggerUpdate();
                };
                legDiv.appendChild(rmBtn);

                legsContainer.appendChild(legDiv);
            });

            const addLegBtn = document.createElement('button');
            addLegBtn.className = 'ui-button';
            addLegBtn.textContent = '+ Add Leg';
            addLegBtn.style.width = '100%';
            addLegBtn.style.marginTop = '8px';
            addLegBtn.onclick = () => {
                const now = Date.now();
                const firstTrack = Object.keys(railData.tracks)[0];
                trip.legs.push({
                    trackId: firstTrack,
                    fromStationId: 'A',
                    toStationId: 'B',
                    departureTime: now,
                    arrivalTime: now + 300000 
                });
                renderLegs();
                this.triggerUpdate();
            };
            legsContainer.appendChild(addLegBtn);
        };
        
        renderLegs();
        wrapper.appendChild(legsContainer);
        this.contentContainer.appendChild(wrapper);
    }
}
