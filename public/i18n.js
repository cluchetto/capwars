import {messages} from './locales/messages.js';
export const languages=[
 ['en','English','en-US'],['fr','Français','fr-FR'],['zh','简体中文','zh-CN'],['ja','日本語','ja-JP'],
 ['id','Bahasa Indonesia','id-ID'],['de','Deutsch','de-DE'],['es','Español','es-ES'],['pt','Português','pt-BR'],
 ['hi','हिन्दी','hi-IN'],['it','Italiano','it-IT'],['ru','Русский','ru-RU'],['tr','Türkçe','tr-TR'],
 ['ar','العربية','ar'],['he','עברית','he-IL'],['ko','한국어','ko-KR'],['vi','Tiếng Việt','vi-VN'],
];
export const normalizeLanguage=value=>languages.some(([code])=>code===value)?value:'en';
export const languageLocale=lang=>languages.find(([code])=>code===normalizeLanguage(lang))[2];
export const languageDirection=lang=>['ar','he'].includes(lang)?'rtl':'ltr';
export const translateMessage=(lang,key,french)=>messages[normalizeLanguage(lang)]?.[key]??((lang==='fr'&&french)||key);
const cityNames={
 en:['New York','Paris','Sydney','Beijing','Cape Town','São Paulo'],
 fr:['New York','Paris','Sydney','Pékin','Le Cap','São Paulo'],
 zh:['纽约','巴黎','悉尼','北京','开普敦','圣保罗'],ja:['ニューヨーク','パリ','シドニー','北京','ケープタウン','サンパウロ'],
 id:['New York','Paris','Sydney','Beijing','Cape Town','São Paulo'],de:['New York','Paris','Sydney','Peking','Kapstadt','São Paulo'],
 es:['Nueva York','París','Sídney','Pekín','Ciudad del Cabo','São Paulo'],pt:['Nova York','Paris','Sydney','Pequim','Cidade do Cabo','São Paulo'],
 hi:['न्यूयॉर्क','पेरिस','सिडनी','बीजिंग','केप टाउन','साओ पाउलो'],it:['New York','Parigi','Sydney','Pechino','Città del Capo','San Paolo'],
 ru:['Нью-Йорк','Париж','Сидней','Пекин','Кейптаун','Сан-Паулу'],tr:['New York','Paris','Sidney','Pekin','Cape Town','São Paulo'],
 ar:['نيويورك','باريس','سيدني','بكين','كيب تاون','ساو باولو'],he:['ניו יורק','פריז','סידני','בייג׳ינג','קייפטאון','סאו פאולו'],
 ko:['뉴욕','파리','시드니','베이징','케이프타운','상파울루'],vi:['New York','Paris','Sydney','Bắc Kinh','Cape Town','São Paulo'],
};
export function localizedCity(city,lang){const index=cityNames.en.indexOf(({'Pékin':'Beijing','Le Cap':'Cape Town'}[city]||city));return index<0?city:cityNames[normalizeLanguage(lang)][index];}
const isoPairs='FJI:FJ TZA:TZ SAH:EH CAN:CA USA:US KAZ:KZ UZB:UZ PNG:PG IDN:ID ARG:AR CHL:CL COD:CD SOM:SO KEN:KE SDN:SD TCD:TD HTI:HT DOM:DO RUS:RU BHS:BS FLK:FK NOR:NO GRL:GL ATF:TF TLS:TL ZAF:ZA LSO:LS MEX:MX URY:UY BRA:BR BOL:BO PER:PE COL:CO PAN:PA CRI:CR NIC:NI HND:HN SLV:SV GTM:GT BLZ:BZ VEN:VE GUY:GY SUR:SR FRA:FR ECU:EC PRI:PR JAM:JM CUB:CU ZWE:ZW BWA:BW NAM:NA SEN:SN MLI:ML MRT:MR BEN:BJ NER:NE NGA:NG CMR:CM TGO:TG GHA:GH CIV:CI GIN:GN GNB:GW LBR:LR SLE:SL BFA:BF CAF:CF COG:CG GAB:GA GNQ:GQ ZMB:ZM MWI:MW MOZ:MZ SWZ:SZ AGO:AO BDI:BI ISR:IL LBN:LB MDG:MG PSE:PS GMB:GM TUN:TN DZA:DZ JOR:JO ARE:AE QAT:QA KWT:KW IRQ:IQ OMN:OM VUT:VU KHM:KH THA:TH LAO:LA MMR:MM VNM:VN PRK:KP KOR:KR MNG:MN IND:IN BGD:BD BTN:BT NPL:NP PAK:PK AFG:AF TJK:TJ KGZ:KG TKM:TM IRN:IR SYR:SY ARM:AM SWE:SE BLR:BY UKR:UA POL:PL AUT:AT HUN:HU MDA:MD ROU:RO LTU:LT LVA:LV EST:EE DEU:DE BGR:BG GRC:GR TUR:TR ALB:AL HRV:HR CHE:CH LUX:LU BEL:BE NLD:NL PRT:PT ESP:ES IRL:IE NCL:NC SLB:SB NZL:NZ AUS:AU LKA:LK CHN:CN TWN:TW ITA:IT DNK:DK GBR:GB ISL:IS AZE:AZ GEO:GE PHL:PH MYS:MY BRN:BN SVN:SI FIN:FI SVK:SK CZE:CZ ERI:ER JPN:JP PRY:PY YEM:YE SAU:SA ATA:AQ CYP:CY MAR:MA EGY:EG LBY:LY ETH:ET DJI:DJ UGA:UG RWA:RW BIH:BA MKD:MK SRB:RS MNE:ME KOS:XK TTO:TT SSD:SS';
const regionCodes=Object.fromEntries(isoPairs.split(' ').map(pair=>pair.split(':')));
const displayNames=new Map();
export function localizedCountry(country,lang){
 const fallback=lang==='fr'?country.name:country.name_en||country.name;
 const code=country.code?.length===2?country.code:regionCodes[country.code];
 if(!code)return fallback;
 try{if(!displayNames.has(lang))displayNames.set(lang,new Intl.DisplayNames([languageLocale(lang)],{type:'region'}));return displayNames.get(lang).of(code)||fallback;}catch{return fallback;}
}
