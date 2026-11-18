/** Split SQL only outside PostgreSQL quotes, dollar bodies and nested comments.
 * https://www.postgresql.org/docs/current/sql-syntax-lexical.html
 */
export function transactionalMigrationSql(sql) {
    const statements=[];let start=0,first='',mode='normal',tag='',depth=0,escape=false;
    for(let i=0;i<sql.length;i++) {
        const char=sql[i],next=sql[i+1];
        if(mode==='line'){if(char==='\n')mode='normal';continue;}
        if(mode==='comment'){if(char==='/'&&next==='*'){depth++;i++;}else if(char==='*'&&next==='/'){depth--;i++;if(!depth)mode='normal';}continue;}
        if(mode==='single'){if(escape&&char==='\\'){i++;continue;}if(char==="'"){if(next==="'")i++;else mode='normal';}continue;}
        if(mode==='double'){if(char==='"'){if(next==='"')i++;else mode='normal';}continue;}
        if(mode==='dollar'){if(sql.startsWith(tag,i)){i+=tag.length-1;mode='normal';}continue;}
        if(char==='-'&&next==='-'){mode='line';i++;continue;}
        if(char==='/'&&next==='*'){mode='comment';depth=1;i++;continue;}
        if(char==="'"){escape=/(?:^|[^A-Za-z0-9_$])[eE]$/.test(sql.slice(Math.max(0,i-2),i));mode='single';continue;}
        if(char==='"'){mode='double';continue;}
        if(char==='$'){const found=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);if(found){tag=found[0];mode='dollar';i+=tag.length-1;continue;}}
        if(!first&&/[A-Za-z]/.test(char)){first=sql.slice(i).match(/^[A-Za-z]+/)[0].toUpperCase();}
        if(char===';'){statements.push({sql:sql.slice(start,i+1),first});start=i+1;first='';}
    }
    if(!['normal','line'].includes(mode))throw Error('Unterminated SQL quote or comment in migration');
    if(start<sql.length)statements.push({sql:sql.slice(start),first});
    return statements.map(statement=>{
        if(['ROLLBACK','ABORT','PREPARE'].includes(statement.first))throw Error('Unsupported migration transaction control: '+statement.first);
        if(['BEGIN','COMMIT','END','START'].includes(statement.first))return '-- Outer transaction owned by the Suno upgrade.\n';
        return statement.sql;
    }).join('');
}
