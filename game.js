export const CHARACTERS=[
  "Revolverheldin",
  "Sheriff",
  "Goldgräberin",
  "Gefangener",
  "Banditin",
  "Saloonbesitzer",
  "Kopfgeldjäger"
];

export const ACCESSORIES=[
  "Sombrero",
  "Zylinder",
  "Partyhut",
  "Sonnenbrille",
  "Kopfhörer",
  "Kochmütze",
  "Krone"
];

export const LOCATIONS=[
  "Büro",
  "Vulkan",
  "Strand",
  "Berge",
  "Weltraum",
  "Unterwasserwelt",
  "Nachtclub"
];

export function createDeck(){
  const deck=[];

  for(let c=0;c<7;c++){
    for(let a=0;a<7;a++){
      deck.push({
        id:deck.length,
        c,
        a,
        l:(c+a)%7,
        character:CHARACTERS[c],
        accessory:ACCESSORIES[a],
        location:LOCATIONS[(c+a)%7]
      });
    }
  }

  for(let i=deck.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [deck[i],deck[j]]=[deck[j],deck[i]];
  }

  return deck;
}

export function related(card,secret){
  return (
    card.c===secret.c ||
    card.a===secret.a ||
    card.l===secret.l
  );
}

export function sameCard(card,guess){
  return !!card &&
    Number(guess?.c)===card.c &&
    Number(guess?.a)===card.a &&
    Number(guess?.l)===card.l;
}

export function publicCard(card){
  return {
    id:card.id,
    character:card.character,
    accessory:card.accessory,
    location:card.location
  };
}

export function publicSecret(secret){
  return secret ? {
    character:secret.character,
    accessory:secret.accessory,
    location:secret.location
  } : null;
}

export function publicState(game,viewer){

  const pendingVotes=
    game.pending?.type==="play"
      ? game.pending.votes.map(v=>({
          player:v.player,
          choice:v.choice
        }))
      : [];

  return {

    phase:game.phase,

    current:game.current,

    deckCount:game.deck.length,

    winner:game.winner,

    pending:game.pending ? {
      type:game.pending.type,
      player:game.pending.player,
      card:game.pending.card
        ? publicCard(game.pending.card)
        : null,
      votes:pendingVotes,
      guess:game.pending.guess || null
    } : null,

    players:game.players.map((p,i)=>({

      id:p.id,

      name:p.name,

      connected:p.connected,

      handCount:p.hand.length,

      hand:
        i===viewer
          ? p.hand.map(publicCard)
          : null,

      relatedCount:p.related.length,

      notRelatedCount:p.notRelated.length,

      relatedFlipped:p.relatedFlipped,

      notRelatedFlipped:p.notRelatedFlipped,

      related:
        !p.relatedFlipped
          ? p.related.map(publicCard)
          : null,

      notRelated:
        !p.notRelatedFlipped
          ? p.notRelated.map(publicCard)
          : null,

      secret:
        i===viewer
          ? null
          : publicSecret(p.secret)

    }))
  };
}

export function createGame(){

  return {
    phase:"lobby",
    deck:[],
    players:[],
    current:0,
    pending:null,
    winner:null
  };

}

export function startGame(game){

  game.deck=createDeck();

  game.pending=null;

  game.winner=null;

  game.current=0;

  game.players.forEach(p=>{

    p.secret=game.deck.pop();

    p.hand=[];

    p.related=[];

    p.notRelated=[];

    p.relatedFlipped=false;

    p.notRelatedFlipped=false;

  });

  for(const p of game.players){

    for(let i=0;i<5;i++){

      p.hand.push(game.deck.pop());

    }

  }

  game.phase="playing";

}
