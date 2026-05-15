const ideas = [
    {
        title: "Hack #1: El 'Frankenstein'",
        category: "Educativo",
        description: "Explicar que el DEMRE combina tus mejores puntajes de distintas rendiciones (no se promedian).",
        script: "¡El sistema toma tu 800 de Invierno y tu 900 de Verano! Nadie promedia nada. Es un buffet.",
        status: "Idea",
        createdAt: new Date().toISOString()
    },
    {
        title: "Foco Estratégico",
        category: "Social Media",
        description: "Recomendación de prepararse para rendir al máximo en solo 1 o 2 materias específicas en esta ocasión.",
        script: "Por eso, la estrategia de Invierno es ir a asegurar UNA O DOS pruebas específicas. No te estreses por todas.",
        status: "Idea",
        createdAt: new Date().toISOString()
    },
    {
        title: "Hack #2: Distractores",
        category: "Educativo",
        description: "Entender que las alternativas falsas no son al azar, sino trampas diseñadas a partir de errores comunes.",
        script: "Se llaman 'Distractores'. Si en mate te olvidas de cambiar un signo negativo, el resultado va a estar en la B esperándote...",
        status: "Idea",
        createdAt: new Date().toISOString()
    },
    {
        title: "Entrenamiento Inteligente",
        category: "Publicidad",
        description: "La importancia de armar ensayos personalizados en puntajenacional.cl para aprender a esquivar estas trampas.",
        script: "Entra a puntajenacional.cl y arma ensayos personalizados. No solo te dice que la 'C' está mala, te explica la trampa...",
        status: "Idea",
        createdAt: new Date().toISOString()
    },
    {
        title: "Logística del Día D",
        category: "Institucional",
        description: "Qué llevar (carnet, tarjeta, lápiz, goma), prohibiciones (celulares) y el consejo de vestirse en capas.",
        script: "Hará frío. Las salas son heladas. Lleva ropa en capas... Solo necesitas tu carnet, tarjeta impresa, lápiz y goma.",
        status: "Idea",
        createdAt: new Date().toISOString()
    },
    {
        title: "Planificación Post-Prueba",
        category: "Social Media",
        description: "Cómo usar los puntajes obtenidos como un colchón de seguridad para enfocar el resto del año.",
        script: "Esos puntajes quedan congelados... Son tu colchón de seguridad. Si aseguraste Ciencias ahora, dedícate a Matemáticas.",
        status: "Idea",
        createdAt: new Date().toISOString()
    }
];

const existing = JSON.parse(localStorage.getItem('av_planner_projects') || '[]');
const updated = [...existing];

ideas.forEach(idea => {
    if (!updated.find(p => p.title === idea.title)) {
        updated.push({ ...idea, id: 'local-' + Math.random().toString(36).substr(2, 9) });
    }
});

localStorage.setItem('av_planner_projects', JSON.stringify(updated));
console.log("Database seeded with " + ideas.length + " ideas!");
location.reload();
