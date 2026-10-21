import { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, Footer, PageNumber, Packer, VerticalAlign } from 'docx';
import { reportBlocks } from './reportContent.mjs';
import { validateReport } from '../supabase/functions/_shared/reportCore.mjs';
const border={style:BorderStyle.SINGLE,size:4,color:'B5B5B5'};
function makeTable(t){
  const width=9026; // A4 minus 2.54 cm margins, in twips.
  return new Table({width:{size:width,type:WidthType.DXA},columnWidths:Array(t.cols).fill(Math.floor(width/t.cols)),layout:'fixed',
    rows:Array.from({length:t.rows},(_,r)=>new TableRow({cantSplit:true,children:t.cells.filter(c=>c.row===r).sort((a,b)=>a.col-b.col).map(c=>new TableCell({
      columnSpan:c.colSpan||1,rowSpan:c.rowSpan||1,verticalAlign:VerticalAlign.CENTER,width:{size:Math.floor(width/t.cols)*(c.colSpan||1),type:WidthType.DXA},
      margins:{top:90,bottom:90,left:110,right:110},borders:{top:border,bottom:border,left:border,right:border},
      children:[new Paragraph({spacing:{after:0,line:260},children:[new TextRun({text:c.text||'—',size:22})]})]
    }))}))});
}
export function createReportDocument(report){
  if(report.status!=='ready'||!report.document||!report.validation?.deterministic_passed||!report.validation?.review?.passed)throw new Error('Esta versão ainda não foi validada.');
  if(validateReport(report.document,report.source_snapshot).length)throw new Error('Esta versão contém divergências e não pode ser exportada.');
  const children=reportBlocks(report).flatMap(block=>{
    if(block.type==='table')return [new Paragraph({text:block.table.title||'Resultados registrados',keepNext:true,spacing:{before:160,after:100},run:{bold:true,size:22}}),makeTable(block.table),new Paragraph({spacing:{after:0}})];
    if(block.type==='heading')return [new Paragraph({alignment:block.level===1?AlignmentType.CENTER:AlignmentType.LEFT,keepNext:true,spacing:{before:block.level===1?0:240,after:160},children:[new TextRun({text:block.text,bold:true,size:block.level===3?24:28})]})];
    return [new Paragraph({alignment:block.signature?AlignmentType.CENTER:block.metadata?AlignmentType.LEFT:AlignmentType.JUSTIFIED,
      spacing:{after:block.metadata?60:140,before:block.signature?180:0,line:360},children:[new TextRun({text:block.text})]})];
  });
  return new Document({creator:report.source_snapshot.settings.professional_name,title:report.source_snapshot.settings.title,
    description:'Rascunho para revisão profissional. Conteúdo editável.',
    styles:{default:{document:{run:{font:'Times New Roman',size:24,color:'000000'},paragraph:{widowControl:true}}}},
    sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1440,bottom:1440,left:1440,right:1440}}},
      footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun({text:'Página ',size:20}),new TextRun({children:[PageNumber.CURRENT],size:20})]})]})},children}]});
}
export async function reportDocxBlob(report){return Packer.toBlob(createReportDocument(report));}
