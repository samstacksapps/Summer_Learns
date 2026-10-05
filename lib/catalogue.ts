import 'server-only';
import map from '@/data/skill-map.json';
import assessmentConfig from './config/assessment.json';
import type {Item,Skill} from './assessment';
export const skills=map.skills as Skill[];
export const items=skills.filter(skill=>!assessmentConfig.deferredAudioSkills.includes(skill.id)).flatMap(skill=>skill.exampleItems);
export function publicItem(item:Item){return {id:item.id,skillId:item.skillId,subject:item.subject,kind:item.kind,yearLevel:item.yearLevel,prompt:item.prompt,choices:item.choices,passage:item.passage};}
export const curriculumVerified=map.skills.every(skill=>skill.curriculumVerified);
