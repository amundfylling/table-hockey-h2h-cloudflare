import json,zlib,base64,collections,sys
S=json.load(open(sys.argv[1]))
for n,s in enumerate(S):
    c=collections.Counter((i.get('ff'),i.get('color')) for i in s['items'] if i['k']=='text')
    secs=[]; D={'ff':'Schibsted Grotesk','color':'#4A525B'}
    for i in s['items']:
        i=dict(i); sec=i.pop('sec',None)
        if i['k']=='text':
            for k,v in D.items():
                if i.get(k)==v: i.pop(k)
                elif k not in i: i[k]=None
            if not i.pop('oneLine',0): i['ml']=1
        if not secs or secs[-1][0]!=sec: secs.append([sec,[]])
        secs[-1][1].append(i)
    o=json.dumps(secs,ensure_ascii=False,separators=(',',':')).encode()
    co=zlib.compressobj(9,zlib.DEFLATED,-15); b=co.compress(o)+co.flush()
    b64=base64.b64encode(b).decode()
    open(f'penpot-data/s{n}.b64','w').write(b64)
    meta={k:v for k,v in s.items() if k!='items'}
    json.dump(meta,open(f'penpot-data/s{n}.meta.json','w'))
    print(n,s['name'],len(s['items']),len(o),len(b64),[x[0] for x in secs], c.most_common(2) if n==0 else '')
