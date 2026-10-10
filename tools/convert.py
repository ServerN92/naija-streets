import xml.etree.ElementTree as ET, math, json, collections, sys
W={'motorway':22,'trunk':18,'primary':14,'secondary':11,'tertiary':9,'unclassified':7,'residential':6.5,'service':4.5,'living_street':5,'motorway_link':8,'primary_link':8,'secondary_link':7,'trunk_link':8,'tertiary_link':7,'footway':2.5,'path':2,'steps':2.5,'pedestrian':4,'track':4}
def conv(f,out):
    nodes={}; ways=[]; bounds=None; pois=[]
    for ev,el in ET.iterparse(f,events=('end',)):
        if el.tag=='bounds': bounds={k:float(v) for k,v in el.attrib.items()}
        elif el.tag=='node':
            nodes[el.get('id')]=(float(el.get('lat')),float(el.get('lon')))
            tags={t.get('k'):t.get('v') for t in el.findall('tag')}
            if tags.get('amenity') or tags.get('shop') or tags.get('highway') in ('bus_stop','traffic_signals','crossing') or tags.get('public_transport'):
                pois.append((el.get('id'),tags))
            el.clear()
        elif el.tag=='way':
            tags={t.get('k'):t.get('v') for t in el.findall('tag')}; ways.append((tags,[n.get('ref') for n in el.findall('nd')])); el.clear()
    lat0=(bounds['minlat']+bounds['maxlat'])/2; lon0=(bounds['minlon']+bounds['maxlon'])/2
    kx=111320*math.cos(math.radians(lat0)); kz=110540
    P=lambda i:(round((nodes[i][1]-lon0)*kx,1), round(-(nodes[i][0]-lat0)*kz,1))  # x east, z south
    roads=[]; bld=[]; areas=[]
    for tags,nd in ways:
        if not all(n in nodes for n in nd) or len(nd)<2: continue
        pts=[P(n) for n in nd]
        hw=tags.get('highway')
        if hw in W:
            r={'t':hw,'w':float(tags.get('width',W[hw])) if str(tags.get('width','')).replace('.','',1).isdigit() else W[hw],'p':[c for pt in pts for c in pt]}
            if tags.get('name'): r['n']=tags['name']
            if tags.get('bridge')=='yes': r['br']=1
            if tags.get('oneway')=='yes': r['ow']=1
            if tags.get('lanes'): r['ln']=tags['lanes']
            roads.append(r)
        elif 'building' in tags and nd[0]==nd[-1] and len(pts)>=4:
            b={'p':[c for pt in pts[:-1] for c in pt]}
            lv=tags.get('building:levels')
            if lv and lv.replace('.','',1).isdigit(): b['l']=float(lv)
            if tags.get('building') not in ('yes',None): b['k']=tags['building']
            for k in ('amenity','shop','name'):
                if tags.get(k): b[k[0]]=tags[k]
            bld.append(b)
        elif nd[0]==nd[-1] and (tags.get('landuse') or tags.get('leisure') or tags.get('natural') or tags.get('amenity')):
            a={'k':tags.get('landuse') or tags.get('leisure') or tags.get('natural') or tags.get('amenity'),'p':[c for pt in pts[:-1] for c in pt]}
            if tags.get('name'): a['n']=tags['name']
            areas.append(a)
    poi=[]
    for i,t in pois:
        x,z=P(i); d={'x':x,'z':z}
        for k in ('amenity','shop','highway','name','public_transport'):
            if t.get(k): d[k[0:2]]=t[k]
        poi.append(d)
    data={'name':out,'origin':[lat0,lon0],'size':[round((bounds['maxlon']-bounds['minlon'])*kx),round((bounds['maxlat']-bounds['minlat'])*kz)],'roads':roads,'buildings':bld,'areas':areas,'pois':poi}
    json.dump(data,open(out+'.json','w'),separators=(',',':'))
    lv=collections.Counter(int(b.get('l',0)) for b in bld)
    print(out, 'roads',len(roads),'buildings',len(bld),'areas',len(areas),'pois',len(poi),'levels',dict(sorted(lv.items())[:8]), 'bridges', sum(1 for r in roads if r.get('br')))
for f,o in [('mushin.osm','mushin'),('oshodi.osm','oshodi'),('ajegunle.osm','ajegunle')]: conv(f,o)
